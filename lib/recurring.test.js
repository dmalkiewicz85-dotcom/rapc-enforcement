import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planRecurringFines } from './recurring.js'
import { RULE_STEPS } from './seed.js'

// Parking: step 3 $50 fine, step 4 $100 every 30 days until compliance.
const data = (events, status = 'OPEN') => ({
  VIOLATIONS: [{ id: 'V1', case_number: 'VIO-2026-0001', rule_id: 'RULE-008', status, actual_deadline: '2026-09-22' }],
  ENFORCEMENT_EVENTS: events,
  RULE_ENFORCEMENT_STEPS: RULE_STEPS,
})
const approved = (id, step, at) => ({ id, violation_id: 'V1', step_number: step, status: 'APPROVED', approved_at: at })

test('nothing scheduled before the case reaches a recurring step', () => {
  const p = planRecurringFines(data([approved('E1', 1, '2026-08-01'), approved('E3', 3, '2026-08-20')]), '2026-09-30')
  assert.equal(p.events.length, 0)
})

test('step 4 approved on 8/20 → next $100 fine due 9/19, scheduled once as PENDING', () => {
  const evs = [approved('E1', 1, '2026-08-01'), approved('E4', 4, '2026-08-20')]
  assert.equal(planRecurringFines(data(evs), '2026-09-18').events.length, 0)
  const p = planRecurringFines(data(evs), '2026-09-19')
  assert.equal(p.events.length, 1)
  const e = p.events[0]
  assert.equal(e.status, 'PENDING_BOARD_APPROVAL')
  assert.equal(e.step_number, 4)
  assert.equal(e.fine_amount, 100)
  assert.equal(e.event_type, 'FINE')
  assert.equal(p.auditRows[0].action, 'RECURRING_FINE_SCHEDULED')
  // Idempotent: with that pending event present nothing more is scheduled.
  const again = planRecurringFines(data([...evs, { ...e }]), '2026-10-25')
  assert.equal(again.events.length, 0)
})

test('after the recurrence is approved, the next one is 30 days after that approval', () => {
  const evs = [approved('E4', 4, '2026-08-20'), approved('E5', 4, '2026-09-19')]
  assert.equal(planRecurringFines(data(evs), '2026-10-18').events.length, 0)
  assert.equal(planRecurringFines(data(evs), '2026-10-19').events.length, 1)
})

test('closed cases and per-occurrence recurrences (blank interval) are never scheduled', () => {
  const evs = [approved('E4', 4, '2026-08-20')]
  assert.equal(planRecurringFines(data(evs, 'CLOSED'), '2026-12-01').events.length, 0)
  // Trash cans step 3: $50 per occurrence, recurrence_days blank.
  const trash = {
    VIOLATIONS: [{ id: 'V2', case_number: 'VIO-2026-0002', rule_id: 'RULE-003', status: 'OPEN' }],
    ENFORCEMENT_EVENTS: [{ id: 'T3', violation_id: 'V2', step_number: 3, status: 'APPROVED', approved_at: '2026-06-01' }],
    RULE_ENFORCEMENT_STEPS: RULE_STEPS,
  }
  assert.equal(planRecurringFines(trash, '2026-12-01').events.length, 0)
})
