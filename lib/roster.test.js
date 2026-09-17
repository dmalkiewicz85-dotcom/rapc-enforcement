import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseRoster, planRosterImport, normalizeEmails, normalizeName, detectHeader } from './roster.js'

// Shape of the HOA's "CO-OWNER DIRECTORY" export: two title rows, then the header.
const GRID = [
  ['', 'Reserves at Park Creek Condominium Association', '', '', ''],
  ['*SORTED by ADDRESS #', 'CO-OWNER DIRECTORY*  (as of 4-30-2026)', '', '', ''],
  ['Unit Address', 'Unit/Lot #', 'Name', 'Phone', 'Email'],
  ['3482 Park Creek Lane', '3', 'Gregory and Andrea Hansen', '(513) 292-1301 (c), (513) 317-0003 (c)', 'gr.hansen@hotmail.com, alhansen2002@yahoo.com'],
  ['3486 Park Creek Lane', '2', 'Vishal and Pooja Naik', '(832) 314-8606 (h)', 'naikhousemi@gmail.com'],
  ['3547 Park Creek Lane', '60', 'NMJ Building, LLC', '(313) 610-4213 (c)', 'quadirjaleel@hotmail.com'],
  ['', '', '', '', ''],
]

test('detects the header row below title rows and ignores Unit/Lot #', () => {
  const h = detectHeader(GRID)
  assert.equal(h.headerRow, 2)
  assert.deepEqual(h.columns, { address: 0, name: 2, email: 4, phone: 3 })
  assert.deepEqual(h.missing, [])
})

test('parses records: all emails kept, unit address is the mailing address, name verbatim', () => {
  const { records, errors } = parseRoster(GRID, { city: 'Canton', state: 'MI', zip: '48188' })
  assert.deepEqual(errors, [])
  assert.equal(records.length, 3)
  const r = records[0]
  assert.equal(r.row, 4)
  assert.equal(r.property_address, '3482 Park Creek Lane')
  assert.equal(r.address_normalized, '3482 PARK CREEK')
  assert.equal(r.name, 'Gregory and Andrea Hansen')
  assert.equal(r.email, 'gr.hansen@hotmail.com, alhansen2002@yahoo.com')
  assert.equal(r.mailing_address, '3482 Park Creek Lane')
  assert.equal(r.mailing_city, 'Canton')
  assert.equal(r.mailing_zip, '48188')
  assert.equal(records[2].name, 'NMJ Building, LLC')
})

test('errors: missing required column, blank name, duplicate address, bad email', () => {
  assert.match(parseRoster([['Foo', 'Bar']]).errors[0].message, /required columns/)
  const grid = [
    ['Property Address', 'Owner Name', 'Email'],
    ['1 Main St', '', 'a@b.com'],
    ['2 Main St', 'A', 'a@b.com'],
    ['2 Main Street', 'B', 'c@d.com'],
    ['3 Main St', 'C', 'not-an-email'],
    ['4 Main St', 'D', 'ok@x.org'],
  ]
  const { records, errors } = parseRoster(grid)
  assert.equal(records.length, 2)
  assert.deepEqual(errors.map(e => e.row), [2, 4, 5])
  assert.match(errors[1].message, /duplicate of row 3/)
  assert.match(errors[2].message, /invalid email/)
})

test('normalizers', () => {
  assert.deepEqual(normalizeEmails(' A@X.com ; b@y.com,a@x.com '), { value: 'a@x.com, b@y.com', bad: [] })
  assert.equal(normalizeName('Gaurav & Namrate  Vashishta'), normalizeName('gaurav and namrate vashishta'))
})

const data = () => ({
  PROPERTIES: [
    { id: 'P1', property_address: '3482 Park Creek Ln', address_normalized: '3482 PARK CREEK', active: 'Y' },
    { id: 'P2', property_address: '3486 Park Creek Lane', address_normalized: '3486 PARK CREEK', active: 'Y' },
    { id: 'P3', property_address: '9999 Barrington Drive', address_normalized: '9999 BARRINGTON', active: 'Y' },
  ],
  OWNERS: [
    { id: 'O1', name: 'Gregory & Andrea Hansen', email: 'gr.hansen@hotmail.com', phone: '(513) 292-1301 (c), (513) 317-0003 (c)', mailing_address: '3482 Park Creek Lane', mailing_city: '', mailing_state: '', mailing_zip: '' },
    { id: 'O2', name: 'Previous Owner', email: 'old@x.com', phone: '', mailing_address: '3486 Park Creek Lane', mailing_city: '', mailing_state: '', mailing_zip: '' },
    { id: 'O3', name: 'Someone Gone', email: '', phone: '', mailing_address: '', mailing_city: '', mailing_state: '', mailing_zip: '' },
  ],
  PROPERTY_OWNERSHIP: [
    { id: 'S1', property_id: 'P1', owner_id: 'O1', start_date: '2024-01-01', end_date: '', active: 'Y' },
    { id: 'S2', property_id: 'P2', owner_id: 'O2', start_date: '2024-01-01', end_date: '', active: 'Y' },
    { id: 'S3', property_id: 'P3', owner_id: 'O3', start_date: '2024-01-01', end_date: '', active: 'Y' },
  ],
  VIOLATIONS: [
    { id: 'V1', property_id: 'P2', ownership_id: 'S2', status: 'OPEN' },
    { id: 'V2', property_id: 'P2', ownership_id: 'S2', status: 'CLOSED' },
  ],
  ENFORCEMENT_EVENTS: [
    { id: 'E1', violation_id: 'V1', status: 'PENDING_BOARD_APPROVAL' },
    { id: 'E2', violation_id: 'V1', status: 'APPROVED' },
  ],
  FINES: [
    { id: 'F1', violation_id: 'V1', status: 'BOARD_APPROVED' },
    { id: 'F2', violation_id: 'V1', status: 'SENT_TO_PM' },
    { id: 'F3', violation_id: 'V2', status: 'PENDING_BOARD_APPROVAL' },
  ],
})

test('plan: new property, contact update, ownership change with case closure, missing property', () => {
  const { records } = parseRoster(GRID)
  const plan = planRosterImport(records, data(), '2026-09-17')

  assert.equal(plan.summary.newProperties, 1)
  assert.equal(plan.newProperties[0].record.name, 'NMJ Building, LLC')

  // Same owner (name matches modulo &/and), email list grew → contact update only.
  assert.equal(plan.summary.updatedOwners, 1)
  assert.deepEqual(Object.keys(plan.updatedOwners[0].changes), ['email'])
  assert.equal(plan.updatedOwners[0].changes.email.to, 'gr.hansen@hotmail.com, alhansen2002@yahoo.com')

  // Different name on an existing address → ownership change; open case + pending event flagged.
  assert.equal(plan.summary.ownershipChanges, 1)
  const c = plan.ownershipChanges[0]
  assert.equal(c.previousOwner.id, 'O2')
  assert.equal(c.previousOwnership.id, 'S2')
  assert.deepEqual(c.openCases.map(v => v.id), ['V1'])
  assert.deepEqual(c.pendingEvents.map(e => e.id), ['E1'])
  assert.equal(plan.summary.casesToClose, 1)
  // Fines not yet with PM are voided; one already sent to PM is left alone; closed case V2 untouched.
  assert.deepEqual(c.unsentFines.map(f => f.id), ['F1'])
  assert.equal(plan.summary.finesToVoid, 1)

  // In the sheet, not in the roster → flagged, never deleted.
  assert.deepEqual(plan.removed.map(r => r.property.id), ['P3'])
  assert.equal(plan.summary.unchanged, 0)
})

test('plan: identical roster is all unchanged', () => {
  const d = data()
  d.OWNERS[0].email = 'gr.hansen@hotmail.com, alhansen2002@yahoo.com'
  d.OWNERS[0].phone = '(513) 292-1301 (c), (513) 317-0003 (c)'
  d.OWNERS[1].name = 'Vishal and Pooja Naik'
  d.OWNERS[1].email = 'naikhousemi@gmail.com'
  d.OWNERS[1].phone = '(832) 314-8606 (h)'
  const { records } = parseRoster(GRID)
  const plan = planRosterImport(records.slice(0, 2), d, '2026-09-17')
  assert.equal(plan.summary.unchanged, 2)
  assert.equal(plan.summary.updatedOwners, 0)
  assert.equal(plan.summary.ownershipChanges, 0)
})

test('plan: a property with no active ownership gets one without ending anything', () => {
  const d = data()
  d.PROPERTY_OWNERSHIP[0].active = 'N'
  d.PROPERTY_OWNERSHIP[0].end_date = '2025-01-01'
  const { records } = parseRoster(GRID)
  const plan = planRosterImport(records.slice(0, 1), d, '2026-09-17')
  assert.equal(plan.ownershipChanges.length, 1)
  assert.equal(plan.ownershipChanges[0].previousOwnership, null)
  assert.equal(plan.ownershipChanges[0].previousOwner, null)
})

test('plan: inactive property reappearing is reactivated', () => {
  const d = data()
  d.PROPERTIES[0].active = 'N'
  const { records } = parseRoster(GRID)
  const plan = planRosterImport(records.slice(0, 1), d, '2026-09-17')
  assert.deepEqual(plan.reactivated.map(p => p.id), ['P1'])
})
