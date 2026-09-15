import { test } from 'node:test'
import assert from 'node:assert/strict'
import { determineEnforcement, nextRecurringFineDue, daysOverdue } from './rules-engine.js'
import { RULES, RULE_STEPS } from './seed.js'
import { addDays } from './time.js'

const parking = RULES.find(r => r.id === 'RULE-008')
const parkingSteps = RULE_STEPS.filter(s => s.rule_id === 'RULE-008')
const ctx = (over = {}) => ({
  rule: parking, steps: parkingSteps, openCase: null, openCaseEvents: [], closedCases: [],
  asOf: '2026-09-15', ...over,
})

test('TEST 1 — first parking violation: first offense, warning, 7-day deadline, $0', () => {
  const d = determineEnforcement(ctx())
  assert.equal(d.offenseNumber, 1)
  assert.equal(d.actionName, 'Warning')
  assert.equal(d.defaultDeadline, '2026-09-22')
  assert.equal(d.fineAmount, 0)
  assert.equal(d.templateType, 'STANDARD_WARNING')
  assert.equal(d.requiresBoardApproval, true)
})

test('TEST 2 — compliance reset: a closed prior case does not escalate', () => {
  const closed = { id: 'V1', status: 'CLOSED', date_observed: '2026-09-01', offense_number: 1 }
  const d = determineEnforcement(ctx({ closedCases: [closed], asOf: '2026-09-25' }))
  assert.equal(d.offenseNumber, 1)
})

test('TEST 3 — unresolved case progresses to the next configured step', () => {
  const open = { id: 'V1', case_number: 'VIO-2026-0001', status: 'OPEN', offense_number: 1 }
  const events = [{ step_number: 1, status: 'APPROVED' }]
  const d = determineEnforcement(ctx({ openCase: open, openCaseEvents: events }))
  assert.equal(d.offenseNumber, 2)
  assert.equal(d.actionName, 'Final Warning')
  assert.equal(d.isFinalWarning, true)
  assert.equal(d.templateType, 'FINAL_WARNING')
})

test('TEST 4 — third parking level is a $50 fine needing Board approval', () => {
  const open = { id: 'V1', case_number: 'VIO-2026-0001', status: 'OPEN', offense_number: 2 }
  const events = [{ step_number: 1, status: 'APPROVED' }, { step_number: 2, status: 'APPROVED' }]
  const d = determineEnforcement(ctx({ openCase: open, openCaseEvents: events }))
  assert.equal(d.offenseNumber, 3)
  assert.equal(d.fineAmount, 50)
  assert.equal(d.isFine, true)
  assert.equal(d.eventType, 'FINE')
  assert.equal(d.requiresBoardApproval, true)
})

test('beyond the last step, a recurring last step repeats', () => {
  const open = { id: 'V1', case_number: 'VIO-2026-0001', status: 'OPEN', offense_number: 4 }
  const events = [1, 2, 3, 4].map(n => ({ step_number: n, status: 'APPROVED' }))
  const d = determineEnforcement(ctx({ openCase: open, openCaseEvents: events }))
  assert.equal(d.offenseNumber, 5)
  assert.equal(d.stepNumber, 4)
  assert.equal(d.fineAmount, 100)
})

test('TEST 5 — recurring fine comes due 30 days after the last approved one', () => {
  const step = parkingSteps.find(s => s.step_number === 4)
  const violation = { status: 'OPEN' }
  const events = [{ step_number: 4, status: 'APPROVED', approved_at: '2026-09-15T14:00:00Z' }]
  assert.equal(nextRecurringFineDue({ violation, step, events, asOf: '2026-10-14' }), null)
  const due = nextRecurringFineDue({ violation, step, events, asOf: '2026-10-15' })
  assert.deepEqual(due, { dueAt: '2026-10-15', fineAmount: 100 })
})

test('TEST 5b — no second pending recurring fine while one awaits approval', () => {
  const step = parkingSteps.find(s => s.step_number === 4)
  const events = [
    { step_number: 4, status: 'APPROVED', approved_at: '2026-09-15T14:00:00Z' },
    { step_number: 4, status: 'PENDING_BOARD_APPROVAL' },
  ]
  assert.equal(nextRecurringFineDue({ violation: { status: 'OPEN' }, step, events, asOf: '2026-12-01' }), null)
})

test('TEST 6 — a closed case generates no recurring fines', () => {
  const step = parkingSteps.find(s => s.step_number === 4)
  const events = [{ step_number: 4, status: 'APPROVED', approved_at: '2026-09-15T14:00:00Z' }]
  assert.equal(nextRecurringFineDue({ violation: { status: 'CLOSED' }, step, events, asOf: '2027-01-01' }), null)
})

test('per-occurrence recurrence (no interval) never auto-schedules', () => {
  const trash = RULE_STEPS.find(s => s.id === 'RULE-003-S3')
  const events = [{ step_number: 3, status: 'APPROVED', approved_at: '2026-01-01T00:00:00Z' }]
  assert.equal(nextRecurringFineDue({ violation: { status: 'OPEN' }, step: trash, events, asOf: '2026-06-01' }), null)
})

test('rule with no deadline configured yields null so the UI demands an override', () => {
  const noise = RULES.find(r => r.id === 'RULE-001')
  const steps = RULE_STEPS.filter(s => s.rule_id === 'RULE-001')
  const d = determineEnforcement({ rule: noise, steps, openCase: null, asOf: '2026-09-15' })
  assert.equal(d.defaultDeadline, null)
})

test('reset_on_compliance=N counts closed cases inside the window', () => {
  const rule = { ...parking, reset_on_compliance: 'N', offense_window_days: 365 }
  const closedCases = [
    { status: 'CLOSED', date_observed: '2026-01-10' },
    { status: 'CLOSED', date_observed: '2024-01-10' }, // outside window
  ]
  const d = determineEnforcement(ctx({ rule, closedCases }))
  assert.equal(d.offenseNumber, 2)
})

test('daysOverdue', () => {
  const v = { status: 'OPEN', actual_deadline: '2026-09-22' }
  assert.equal(daysOverdue(v, '2026-09-26'), 4)
  assert.equal(daysOverdue(v, '2026-09-20'), 0)
  assert.equal(daysOverdue({ ...v, status: 'CLOSED' }, '2026-12-01'), 0)
})

test('addDays crosses DST boundaries without drift', () => {
  assert.equal(addDays('2026-03-07', 7), '2026-03-14')
  assert.equal(addDays('2026-10-31', 7), '2026-11-07')
})

test('every seeded rule has step 1 and unique step numbers', () => {
  for (const r of RULES) {
    const nums = r.steps.map(s => s.step_number)
    assert.equal(nums[0], 1, r.id)
    assert.equal(new Set(nums).size, nums.length, r.id)
  }
})
