import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildDetermination, resolveDeadline, filterViolations, currentOwnership } from './violations.js'
import { RULES, RULE_STEPS } from './seed.js'

const data = (over = {}) => ({
  PROPERTIES: [
    { id: 'P1', property_address: '3482 Park Creek Lane', address_normalized: '3482 PARK CREEK', active: 'Y' },
    { id: 'P2', property_address: '9999 Gone Street', address_normalized: '9999 GONE', active: 'N' },
    { id: 'P3', property_address: '1 Orphan Way', address_normalized: '1 ORPHAN', active: 'Y' },
  ],
  OWNERS: [
    { id: 'O1', name: 'Gregory and Andrea Hansen', email: 'a@x.com', mailing_address: '3482 Park Creek Lane', mailing_city: 'Canton', mailing_state: 'MI', mailing_zip: '' },
    { id: 'O0', name: 'Former Owner', email: '', mailing_address: '', mailing_city: '', mailing_state: '', mailing_zip: '' },
  ],
  PROPERTY_OWNERSHIP: [
    { id: 'S0', property_id: 'P1', owner_id: 'O0', start_date: '2020-01-01', end_date: '2024-12-31', active: 'N' },
    { id: 'S1', property_id: 'P1', owner_id: 'O1', start_date: '2025-01-01', end_date: '', active: 'Y' },
  ],
  VIOLATION_RULES: RULES.map(({ steps, ...r }) => r),
  RULE_ENFORCEMENT_STEPS: RULE_STEPS,
  VIOLATIONS: [],
  ENFORCEMENT_EVENTS: [],
  ...over,
})

const parking = { propertyId: 'P1', ruleId: 'RULE-008', dateObserved: '2026-09-15' }

test('first parking violation on a property with no history: 1st offense, warning, 7-day deadline', () => {
  const ctx = buildDetermination(data(), parking)
  assert.equal(ctx.owner.id, 'O1')
  assert.equal(ctx.ownership.id, 'S1')
  assert.equal(ctx.openCase, null)
  assert.equal(ctx.determination.offenseNumber, 1)
  assert.equal(ctx.determination.actionName, 'Warning')
  assert.equal(ctx.determination.defaultDeadline, '2026-09-22')
  assert.equal(ctx.determination.fineAmount, 0)
})

test('open case for the same rule and owner progresses to the next step', () => {
  const d = data({
    VIOLATIONS: [{ id: 'V1', case_number: 'VIO-2026-0001', rule_id: 'RULE-008', ownership_id: 'S1', status: 'OPEN', offense_number: 1, date_observed: '2026-09-01' }],
    ENFORCEMENT_EVENTS: [{ id: 'E1', violation_id: 'V1', step_number: 1, status: 'APPROVED' }],
  })
  const ctx = buildDetermination(d, { ...parking, dateObserved: '2026-09-20' })
  assert.equal(ctx.openCase.id, 'V1')
  assert.equal(ctx.determination.offenseNumber, 2)
  assert.equal(ctx.determination.actionName, 'Final Warning')
  assert.match(ctx.determination.basis, /Open case VIO-2026-0001/)
})

test('previous owner\'s open case does not count — new owner starts at zero', () => {
  const d = data({
    VIOLATIONS: [{ id: 'V1', case_number: 'VIO-2025-0001', rule_id: 'RULE-008', ownership_id: 'S0', status: 'OPEN', offense_number: 2, date_observed: '2024-12-01' }],
  })
  const ctx = buildDetermination(d, parking)
  assert.equal(ctx.openCase, null)
  assert.equal(ctx.determination.offenseNumber, 1)
})

test('closed compliant case resets: next observation is a first offense', () => {
  const d = data({
    VIOLATIONS: [{ id: 'V1', case_number: 'VIO-2026-0001', rule_id: 'RULE-008', ownership_id: 'S1', status: 'CLOSED', offense_number: 2, date_observed: '2026-09-01', compliance_status: 'COMPLIANT' }],
  })
  assert.equal(buildDetermination(d, { ...parking, dateObserved: '2026-09-25' }).determination.offenseNumber, 1)
})

test('a different rule with an open case is independent', () => {
  const d = data({
    VIOLATIONS: [{ id: 'V1', case_number: 'VIO-2026-0001', rule_id: 'RULE-003', ownership_id: 'S1', status: 'OPEN', offense_number: 1, date_observed: '2026-09-01' }],
  })
  assert.equal(buildDetermination(d, parking).determination.offenseNumber, 1)
})

test('noise has no configured deadline → defaultDeadline null, override required', () => {
  const ctx = buildDetermination(data(), { ...parking, ruleId: 'RULE-001' })
  assert.equal(ctx.determination.defaultDeadline, null)
  assert.throws(() => resolveDeadline(ctx.determination, {}), /no configured deadline/)
  assert.throws(() => resolveDeadline(ctx.determination, { deadlineOverride: '2026-10-01' }), /reason is required/)
  assert.deepEqual(resolveDeadline(ctx.determination, { deadlineOverride: '2026-10-01', overrideReason: 'Board set 14 days' }),
    { actualDeadline: '2026-10-01', overridden: true })
})

test('resolveDeadline: default accepted as-is; a different date needs a reason', () => {
  const det = { defaultDeadline: '2026-09-22' }
  assert.deepEqual(resolveDeadline(det, {}), { actualDeadline: '2026-09-22', overridden: false })
  assert.deepEqual(resolveDeadline(det, { deadlineOverride: '2026-09-22' }), { actualDeadline: '2026-09-22', overridden: false })
  assert.throws(() => resolveDeadline(det, { deadlineOverride: '2026-09-30' }), /reason/)
  assert.equal(resolveDeadline(det, { deadlineOverride: '2026-09-30', overrideReason: 'Owner travelling' }).overridden, true)
})

test('refuses inactive property, unknown rule, and property with no current owner', () => {
  assert.throws(() => buildDetermination(data(), { ...parking, propertyId: 'P2' }), /inactive/)
  assert.throws(() => buildDetermination(data(), { ...parking, ruleId: 'RULE-999' }), /not found/)
  assert.throws(() => buildDetermination(data(), { ...parking, propertyId: 'P3' }), /no current owner/)
  assert.deepEqual(currentOwnership(data(), 'P3'), { ownership: null, owner: null })
})

test('filterViolations by status, rule, overdue, offense, and free text', () => {
  const list = [
    { id: 'a', status: 'OPEN', rule_id: 'RULE-008', overdueDays: 3, offense_number: 1, case_number: 'VIO-2026-0001', owner_name_snapshot: 'Hansen', property: { property_address: '3482 Park Creek Lane' } },
    { id: 'b', status: 'CLOSED', rule_id: 'RULE-003', overdueDays: 0, offense_number: 2, case_number: 'VIO-2026-0002', owner_name_snapshot: 'Naik', property: { property_address: '3486 Park Creek Lane' } },
  ]
  assert.deepEqual(filterViolations(list, { status: 'OPEN' }).map(v => v.id), ['a'])
  assert.deepEqual(filterViolations(list, { ruleId: 'RULE-003' }).map(v => v.id), ['b'])
  assert.deepEqual(filterViolations(list, { overdue: true }).map(v => v.id), ['a'])
  assert.deepEqual(filterViolations(list, { offense: '2' }).map(v => v.id), ['b'])
  assert.deepEqual(filterViolations(list, { q: 'naik' }).map(v => v.id), ['b'])
  assert.deepEqual(filterViolations(list, { q: '0001' }).map(v => v.id), ['a'])
  assert.equal(filterViolations(list).length, 2)
})
