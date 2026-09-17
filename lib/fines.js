// Property Management fine queue and report (spec, PROPERTY MANAGEMENT FINE
// QUEUE / REPORT / FINE STATUS). Fines reach this queue only after Board
// approval. The report is generated and sent by a Board member on purpose,
// never automatically after approval.

import * as XLSX from 'xlsx'
import { readTabs, appendRows, updateRow, updateRows, writeSteps } from './sheets.js'
import { can } from './schema.js'
import { newId } from './ids.js'
import { nowISO, formatDate } from './time.js'

export const PENDING_PM = ['BOARD_APPROVED', 'READY_FOR_PM']
export const PM_UPDATABLE = ['ASSESSED', 'DISPUTED', 'WAIVED']

const FINE_TABS = ['FINES', 'VIOLATIONS', 'ENFORCEMENT_EVENTS', 'PROPERTIES', 'VIOLATION_RULES', 'USERS']

export function joinFines(d) {
  const v = new Map(d.VIOLATIONS.map(x => [x.id, x]))
  const p = new Map(d.PROPERTIES.map(x => [x.id, x]))
  const r = new Map(d.VIOLATION_RULES.map(x => [x.id, x]))
  const e = new Map(d.ENFORCEMENT_EVENTS.map(x => [x.id, x]))
  const u = new Map(d.USERS.map(x => [x.id, x.name]))
  return d.FINES.map(f => {
    const violation = v.get(f.violation_id) ?? null
    return {
      ...f,
      violation,
      event: e.get(f.enforcement_event_id) ?? null,
      property: violation ? p.get(violation.property_id) ?? null : null,
      rule: violation ? r.get(violation.rule_id) ?? null : null,
      approvedByName: u.get(f.approved_by) ?? f.approved_by,
      pendingPm: PENDING_PM.includes(f.status),
    }
  }).sort((a, b) => String(b.approved_at).localeCompare(String(a.approved_at)))
}

export async function loadFines() {
  return joinFines(await readTabs(...FINE_TABS))
}

// Report rows in the spec's recommended column order.
export function buildPmReportRows(fines) {
  return fines.map(f => ({
    'Property Address': f.property?.property_address ?? f.violation?.property_id ?? '',
    'Owner Name': f.violation?.owner_name_snapshot ?? '',
    'Owner Email': f.violation?.owner_email_snapshot ?? '',
    'Violation Type': f.rule?.name ?? f.violation?.rule_id ?? '',
    'Violation Date': formatDate(f.violation?.date_observed),
    'Enforcement Level': f.event ? `Step ${f.event.step_number} — ${f.event.action_name}` : '',
    'Fine Amount': Number(f.amount) || 0,
    'Fine Date': formatDate(f.approved_at),
    'Board Approval Date': formatDate(f.approved_at),
    'Approved By': f.approvedByName,
    'Case Number': f.violation?.case_number ?? '',
    'Fine ID': f.id,
  }))
}

export function pmReportXlsx(rows) {
  const ws = XLSX.utils.json_to_sheet(rows)
  ws['!cols'] = Object.keys(rows[0] ?? { a: 1 }).map(k => ({ wch: Math.max(14, k.length + 2) }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Fines')
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
}

export function pmReportCsv(rows) {
  return XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(rows))
}

// The fines that go on the next report: pending PM and ticked.
export const reportable = fines => fines.filter(f => f.pendingPm && f.include_in_pm_report !== 'N')

function audit(user, at, entity_id, action, old_value, new_value, reason = '') {
  return {
    id: newId('AUD'), user_id: user.id, user_name: user.name, entity_type: 'FINE', entity_id, action,
    old_value: old_value == null ? '' : JSON.stringify(old_value), new_value: new_value == null ? '' : JSON.stringify(new_value),
    reason, created_at: at,
  }
}

export async function setIncludeInReport(fineId, include, user) {
  if (!can(user, 'pm_reports')) throw new Error('Your role cannot manage the PM report')
  const at = nowISO()
  const patch = { include_in_pm_report: include ? 'Y' : 'N' }
  await writeSteps([
    ['fine', () => updateRow('FINES', fineId, patch)],
    ['audit', () => appendRows('AUDIT_LOG', [audit(user, at, fineId, 'PM_REPORT_INCLUDE', null, patch)])],
  ])
  return patch
}

// Records that the report containing these fines went to Property Management.
export async function markSentToPm(fineIds, user, { messageId = '' } = {}) {
  if (!can(user, 'pm_reports')) throw new Error('Your role cannot send the PM report')
  if (!fineIds.length) throw new Error('No fines selected')
  const at = nowISO()
  const patches = fineIds.map(id => ({ id, patch: { status: 'SENT_TO_PM', sent_to_pm_at: at } }))
  await writeSteps([
    ['fines', () => updateRows('FINES', patches)],
    ['audit', () => appendRows('AUDIT_LOG', fineIds.map(id => audit(user, at, id, 'FINE_SENT_TO_PM', null, { sent_to_pm_at: at, gmail_message_id: messageId })))],
  ])
  return { count: fineIds.length, at }
}

// Property Management (or the Board) records what happened on the PM side.
export async function updatePmStatus(fineId, { status, reference = '', notes = '' }, user) {
  if (!can(user, 'update_pm_status') && !can(user, 'pm_reports')) throw new Error('Your role cannot update fine status')
  if (!PM_UPDATABLE.includes(status)) throw new Error(`Status must be one of ${PM_UPDATABLE.join(', ')}`)
  const at = nowISO()
  const patch = { status, pm_reference: reference, pm_notes: notes, ...(status === 'ASSESSED' ? { pm_assessed_at: at } : {}) }
  await writeSteps([
    ['fine', () => updateRow('FINES', fineId, patch)],
    ['audit', () => appendRows('AUDIT_LOG', [audit(user, at, fineId, `FINE_${status}`, null, patch, notes)])],
  ])
  return patch
}
