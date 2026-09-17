// Roster import — the half that touches Google. Reads the tabs, plans with
// lib/roster.js, and (when not a dry run) applies the plan with writeSteps so a
// mid-import failure reports exactly which steps landed.
//
// Ownership change (spec, OWNERSHIP CHANGE LOGIC): end the old ownership,
// close its open cases, cancel their unapproved events and void fines not yet
// sent to Property Management, create the new owner + ownership, log it.
// Nothing is deleted. Properties missing from the roster are only flagged
// unless the admin ticked "deactivate".

import * as XLSX from 'xlsx'
import { readTabs, readSettings, appendRows, updateRows, writeSteps } from './sheets.js'
import { parseRoster, planRosterImport } from './roster.js'
import { newId } from './ids.js'
import { nowISO, todayISO } from './time.js'

// First worksheet → 2-D grid of cell values, as strings/numbers.
export function gridFromFile(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false })
  const ws = wb.Sheets[wb.SheetNames[0]]
  if (!ws) throw new Error('The file has no worksheets')
  return { sheetName: wb.SheetNames[0], grid: XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false }) }
}

export async function previewRoster(buffer) {
  const { sheetName, grid } = gridFromFile(buffer)
  const [data, settings] = await Promise.all([
    readTabs('PROPERTIES', 'OWNERS', 'PROPERTY_OWNERSHIP', 'VIOLATIONS', 'ENFORCEMENT_EVENTS', 'FINES'),
    readSettings(),
  ])
  const defaults = { city: settings.property_city, state: settings.property_state, zip: settings.property_zip }
  const { records, errors, header } = parseRoster(grid, defaults)
  const plan = planRosterImport(records, data, todayISO())
  return { sheetName, header, errors, plan }
}

// Applies a preview. `plan` must come from previewRoster in the same request
// (the route re-parses the uploaded file) so it reflects the sheet as of now.
export async function applyRoster(plan, user, { deactivateMissing = false } = {}) {
  const at = nowISO()
  const today = plan.today
  const audit = (entity_type, entity_id, action, old_value, new_value, reason = '') => ({
    id: newId('AUD'), user_id: user.id, user_name: user.name, entity_type, entity_id, action,
    old_value: old_value == null ? '' : JSON.stringify(old_value),
    new_value: new_value == null ? '' : JSON.stringify(new_value),
    reason, created_at: at,
  })
  const ownerRow = rec => ({
    id: newId('OWN'), name: rec.name, email: rec.email, mailing_address: rec.mailing_address,
    mailing_city: rec.mailing_city, mailing_state: rec.mailing_state, mailing_zip: rec.mailing_zip,
    phone: rec.phone, created_at: at,
  })

  // Build every row up front so the step functions are plain appends/patches.
  const newProperties = [], newOwners = [], newOwnerships = [], auditRows = []
  const propertyPatches = [], ownerPatches = [], ownershipPatches = [], violationPatches = [], eventPatches = [], finePatches = []

  for (const { record } of plan.newProperties) {
    const p = { id: newId('PROP'), property_address: record.property_address, address_normalized: record.address_normalized, active: 'Y', created_at: at, updated_at: at }
    const o = ownerRow(record)
    const os = { id: newId('OWNS'), property_id: p.id, owner_id: o.id, start_date: today, end_date: '', active: 'Y' }
    newProperties.push(p); newOwners.push(o); newOwnerships.push(os)
    auditRows.push(audit('PROPERTY', p.id, 'ROSTER_IMPORT_NEW_PROPERTY', null, { address: p.property_address, owner: o.name }))
  }

  for (const { property, owner, changes } of plan.updatedOwners) {
    const patch = Object.fromEntries(Object.entries(changes).map(([f, c]) => [f, c.to]))
    ownerPatches.push({ id: owner.id, patch })
    auditRows.push(audit('OWNER', owner.id, 'ROSTER_IMPORT_UPDATE_CONTACT',
      Object.fromEntries(Object.entries(changes).map(([f, c]) => [f, c.from])), patch))
  }

  for (const c of plan.ownershipChanges) {
    const o = ownerRow(c.record)
    const os = { id: newId('OWNS'), property_id: c.property.id, owner_id: o.id, start_date: today, end_date: '', active: 'Y' }
    newOwners.push(o); newOwnerships.push(os)
    if (c.previousOwnership) {
      ownershipPatches.push({ id: c.previousOwnership.id, patch: { end_date: today, active: 'N' } })
    }
    for (const v of c.openCases) {
      violationPatches.push({ id: v.id, patch: { status: 'CLOSED', closed_at: at } })
      auditRows.push(audit('VIOLATION', v.id, 'CLOSED_ON_OWNERSHIP_CHANGE', { status: v.status }, { status: 'CLOSED' },
        `Ownership of ${c.property.property_address} changed on roster import`))
    }
    for (const e of c.pendingEvents) {
      eventPatches.push({ id: e.id, patch: { status: 'CANCELLED', override_reason: 'Ownership change on roster import' } })
    }
    for (const f of c.unsentFines) {
      finePatches.push({ id: f.id, patch: { status: 'WAIVED', include_in_pm_report: 'N', pm_notes: 'Voided: ownership change on roster import' } })
      auditRows.push(audit('FINE', f.id, 'VOIDED_ON_OWNERSHIP_CHANGE', { status: f.status }, { status: 'WAIVED' },
        `Fine on ${c.property.property_address} not assessed; property changed hands`))
    }
    auditRows.push(audit('PROPERTY', c.property.id, 'ROSTER_IMPORT_OWNERSHIP_CHANGE',
      c.previousOwner ? { owner_id: c.previousOwner.id, name: c.previousOwner.name } : null,
      { owner_id: o.id, name: o.name, ownership_id: os.id },
      `${c.openCases.length} open case(s) closed, ${c.pendingEvents.length} pending event(s) cancelled, ${c.unsentFines.length} unsent fine(s) voided; new owner's enforcement history starts at zero`))
  }

  for (const p of plan.reactivated) {
    propertyPatches.push({ id: p.id, patch: { active: 'Y', updated_at: at } })
    auditRows.push(audit('PROPERTY', p.id, 'ROSTER_IMPORT_REACTIVATED', { active: p.active }, { active: 'Y' }))
  }

  if (deactivateMissing) {
    for (const { property } of plan.removed) {
      propertyPatches.push({ id: property.id, patch: { active: 'N', updated_at: at } })
      auditRows.push(audit('PROPERTY', property.id, 'ROSTER_IMPORT_DEACTIVATED', { active: 'Y' }, { active: 'N' },
        'Not present in imported roster'))
    }
  }

  auditRows.push(audit('ROSTER', 'ROSTER', 'ROSTER_IMPORT', null, { ...plan.summary, deactivateMissing }))

  const results = await writeSteps([
    ['properties',        () => appendRows('PROPERTIES', newProperties)],
    ['owners',            () => appendRows('OWNERS', newOwners)],
    ['ownerships',        () => appendRows('PROPERTY_OWNERSHIP', newOwnerships)],
    ['end_ownerships',    () => updateRows('PROPERTY_OWNERSHIP', ownershipPatches)],
    ['close_cases',       () => updateRows('VIOLATIONS', violationPatches)],
    ['cancel_events',     () => updateRows('ENFORCEMENT_EVENTS', eventPatches)],
    ['void_fines',        () => updateRows('FINES', finePatches)],
    ['update_owners',     () => updateRows('OWNERS', ownerPatches)],
    ['update_properties', () => updateRows('PROPERTIES', propertyPatches)],
    ['audit',             () => appendRows('AUDIT_LOG', auditRows)],
  ])

  return {
    summary: plan.summary,
    written: {
      properties: newProperties.length, owners: newOwners.length, ownerships: newOwnerships.length,
      endedOwnerships: ownershipPatches.length, closedCases: violationPatches.length,
      cancelledEvents: eventPatches.length, voidedFines: finePatches.length, updatedOwners: ownerPatches.length,
      propertyUpdates: propertyPatches.length, auditEntries: auditRows.length,
    },
    steps: Object.keys(results),
  }
}
