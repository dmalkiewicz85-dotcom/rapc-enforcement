// Roster import — the pure half. Turns a spreadsheet's 2-D cell grid into
// owner records, then diffs them against the PROPERTIES / OWNERS /
// PROPERTY_OWNERSHIP tabs to produce an import plan. Nothing here touches
// Google; lib/roster-import.js applies the plan with writeSteps.
//
// Spec (ROSTER IMPORT): match on Property Address; identify new properties,
// updated owners, ownership changes, removed properties, errors; preview
// before commit; never delete enforcement history.
//
// The HOA's directory ("CO-OWNER DIRECTORY as of 4-30-26") has two title
// rows above the header, columns Unit Address / Unit/Lot # / Name / Phone /
// Email, and comma-separated multiple emails and phones. Decisions taken
// with the Board (Sept 2026): Unit/Lot # is ignored; every email listed is
// kept (notices go to all co-owners); the unit address is the mailing
// address; the owner name is stored exactly as the directory has it.

import { normalizeAddress } from './ids.js'

// Header aliases, matched case-insensitively against the header row. The
// first cell whose text matches wins. `required` columns must be present.
const COLUMNS = {
  address:       { match: /^(unit|property)?\s*address$/i, required: true },
  name:          { match: /^(owner|co-?owner)?\s*name$/i,   required: true },
  email:         { match: /^e-?mail/i,                      required: true },
  phone:         { match: /^phone/i },
  mailing:       { match: /^mailing\s*address/i },
  mailing_city:  { match: /^(mailing\s*)?city/i },
  mailing_state: { match: /^(mailing\s*)?state/i },
  mailing_zip:   { match: /^(mailing\s*)?zip/i },
}

const clean = v => String(v ?? '').replace(/\s+/g, ' ').trim()
const EMAIL = /^[^\s@,]+@[^\s@,]+\.[a-z]{2,}$/i

// Splits "a@x.com, b@y.com" into a validated, de-duplicated, ", "-joined list.
export function normalizeEmails(s) {
  const parts = clean(s).split(/[,;]/).map(p => p.trim().toLowerCase()).filter(Boolean)
  const bad = parts.filter(p => !EMAIL.test(p))
  return { value: [...new Set(parts)].join(', '), bad }
}

// Owner-name equality for change detection: "Gaurav & Namrate" == "gaurav and namrate".
export function normalizeName(s) {
  return clean(s).toLowerCase().replace(/&/g, 'and').replace(/[.,]/g, '').replace(/\s+/g, ' ').trim()
}

// Finds the header row (first row with an address and a name column) and
// returns { headerRow, columns: { field: colIndex } , missing: [] }.
export function detectHeader(grid, scanRows = 10) {
  for (let r = 0; r < Math.min(scanRows, grid.length); r++) {
    const cells = (grid[r] ?? []).map(clean)
    const columns = {}
    for (const [field, { match }] of Object.entries(COLUMNS)) {
      const i = cells.findIndex(c => c && match.test(c))
      if (i >= 0) columns[field] = i
    }
    if ('address' in columns && 'name' in columns) {
      const missing = Object.entries(COLUMNS).filter(([f, c]) => c.required && !(f in columns)).map(([f]) => f)
      return { headerRow: r, columns, missing }
    }
  }
  return { headerRow: -1, columns: {}, missing: Object.keys(COLUMNS).filter(f => COLUMNS[f].required) }
}

// grid: array of arrays of cell values (first sheet, as the file has it).
// defaults: { city, state, zip } used when the roster has no mailing columns.
// Returns { records, errors, header }. Errors carry the 1-based sheet row.
export function parseRoster(grid, defaults = {}) {
  const header = detectHeader(grid)
  const errors = []
  if (header.headerRow < 0 || header.missing.length) {
    errors.push({ row: null, message: `Could not find a header row with the required columns: ${header.missing.join(', ')}` })
    return { records: [], errors, header }
  }
  const { columns } = header
  const cell = (row, f) => (f in columns ? clean(row[columns[f]]) : '')

  const records = []
  const seen = new Map()
  for (let r = header.headerRow + 1; r < grid.length; r++) {
    const row = grid[r] ?? []
    if (!row.some(c => clean(c))) continue
    const sheetRow = r + 1
    const address = cell(row, 'address')
    const name = cell(row, 'name')
    if (!address) { errors.push({ row: sheetRow, message: 'Blank property address' }); continue }
    if (!name) { errors.push({ row: sheetRow, message: `${address}: blank owner name` }); continue }
    const key = normalizeAddress(address)
    if (seen.has(key)) {
      errors.push({ row: sheetRow, message: `${address}: duplicate of row ${seen.get(key)}` })
      continue
    }
    seen.set(key, sheetRow)
    const { value: email, bad } = normalizeEmails(cell(row, 'email'))
    if (bad.length) { errors.push({ row: sheetRow, message: `${address}: invalid email "${bad.join('", "')}"` }); continue }

    records.push({
      row: sheetRow,
      property_address: address,
      address_normalized: key,
      name,
      email,
      phone: cell(row, 'phone'),
      mailing_address: cell(row, 'mailing') || address,
      mailing_city: cell(row, 'mailing_city') || defaults.city || '',
      mailing_state: cell(row, 'mailing_state') || defaults.state || '',
      mailing_zip: cell(row, 'mailing_zip') || defaults.zip || '',
    })
  }
  return { records, errors, header }
}

// Fine statuses that have not reached Property Management yet.
export const UNSENT_FINE = ['PENDING_BOARD_APPROVAL', 'BOARD_APPROVED', 'READY_FOR_PM']

const CONTACT_FIELDS = ['email', 'phone', 'mailing_address', 'mailing_city', 'mailing_state', 'mailing_zip']

// Diffs parsed records against the current tabs.
//   data: { PROPERTIES, OWNERS, PROPERTY_OWNERSHIP, VIOLATIONS, ENFORCEMENT_EVENTS, FINES }
// On an ownership change the old owner's open cases are closed and anything on
// them that has not yet left the building — unapproved events, and fines not
// yet sent to Property Management — is voided, so the new owner never receives
// a notice or fine for the previous owner's conduct (Board decision, Sept 2026).
// Returns the preview the spec asks for plus everything apply() needs.
export function planRosterImport(records, data, today) {
  const byNorm = new Map(data.PROPERTIES.map(p => [p.address_normalized || normalizeAddress(p.property_address), p]))
  const owners = new Map(data.OWNERS.map(o => [o.id, o]))
  const activeOwnership = new Map()
  for (const o of data.PROPERTY_OWNERSHIP) {
    if (o.active === 'Y' && !o.end_date) activeOwnership.set(o.property_id, o)
  }
  const openCasesByOwnership = new Map()
  for (const v of data.VIOLATIONS ?? []) {
    if (v.status !== 'OPEN') continue
    if (!openCasesByOwnership.has(v.ownership_id)) openCasesByOwnership.set(v.ownership_id, [])
    openCasesByOwnership.get(v.ownership_id).push(v)
  }
  const pendingEventsByCase = new Map()
  for (const e of data.ENFORCEMENT_EVENTS ?? []) {
    if (e.status !== 'PENDING_BOARD_APPROVAL') continue
    if (!pendingEventsByCase.has(e.violation_id)) pendingEventsByCase.set(e.violation_id, [])
    pendingEventsByCase.get(e.violation_id).push(e)
  }

  const openFinesByCase = new Map()
  for (const f of data.FINES ?? []) {
    if (!UNSENT_FINE.includes(f.status)) continue
    if (!openFinesByCase.has(f.violation_id)) openFinesByCase.set(f.violation_id, [])
    openFinesByCase.get(f.violation_id).push(f)
  }

  const plan = { newProperties: [], updatedOwners: [], ownershipChanges: [], unchanged: [], removed: [], reactivated: [] }
  const seen = new Set()

  for (const rec of records) {
    const prop = byNorm.get(rec.address_normalized)
    if (!prop) { plan.newProperties.push({ record: rec }); continue }
    seen.add(prop.id)
    const ownership = activeOwnership.get(prop.id)
    const owner = ownership ? owners.get(ownership.owner_id) : null
    const base = { property: prop, record: rec, reactivate: prop.active !== 'Y' }
    if (base.reactivate) plan.reactivated.push(prop)

    if (!owner || normalizeName(owner.name) !== normalizeName(rec.name)) {
      const openCases = ownership ? (openCasesByOwnership.get(ownership.id) ?? []) : []
      plan.ownershipChanges.push({
        ...base,
        previousOwner: owner ?? null,
        previousOwnership: ownership ?? null,
        openCases,
        pendingEvents: openCases.flatMap(v => pendingEventsByCase.get(v.id) ?? []),
        unsentFines: openCases.flatMap(v => openFinesByCase.get(v.id) ?? []),
      })
      continue
    }

    const changes = CONTACT_FIELDS.filter(f => clean(owner[f]) !== rec[f])
    if (changes.length) {
      plan.updatedOwners.push({ ...base, owner, changes: Object.fromEntries(changes.map(f => [f, { from: owner[f], to: rec[f] }])) })
    } else if (!base.reactivate) {
      plan.unchanged.push(base)
    }
  }

  for (const p of data.PROPERTIES) {
    if (!seen.has(p.id) && p.active === 'Y') {
      const ownership = activeOwnership.get(p.id)
      plan.removed.push({ property: p, owner: ownership ? owners.get(ownership.owner_id) ?? null : null })
    }
  }

  plan.today = today
  plan.summary = {
    total: records.length,
    newProperties: plan.newProperties.length,
    updatedOwners: plan.updatedOwners.length,
    ownershipChanges: plan.ownershipChanges.length,
    unchanged: plan.unchanged.length,
    removed: plan.removed.length,
    reactivated: plan.reactivated.length,
    casesToClose: plan.ownershipChanges.reduce((n, c) => n + c.openCases.length, 0),
    finesToVoid: plan.ownershipChanges.reduce((n, c) => n + c.unsentFines.length, 0),
  }
  return plan
}
