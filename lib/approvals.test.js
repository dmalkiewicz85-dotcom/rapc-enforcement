import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planDecision, planCompliance, joinPending } from './approvals.js'
import { RULES, RULE_STEPS } from './seed.js'

const admin = { id: 'U1', name: 'Leslie', role: 'BOARD_ADMIN' }
const arc = { id: 'U2', name: 'Arc', role: 'ARC_MEMBER' }
const pm = { id: 'U3', name: 'PM', role: 'PROPERTY_MANAGEMENT' }
const AT = '2026-09-17T18:00:00.000Z' // 2pm Detroit → today 2026-09-17

const parking = RULES.find(r => r.id === 'RULE-008')
const steps = RULE_STEPS.filter(s => s.rule_id === 'RULE-008')

const ctx = (over = {}) => {
  const violation = { id: 'V1', case_number: 'VIO-2026-0001', rule_id: 'RULE-008', property_id: 'P1', status: 'OPEN', offense_number: 1, date_observed: '2026-09-15', actual_deadline: '2026-09-22', default_deadline: '2026-09-22', ...over.violation }
  const event = { id: 'E1', violation_id: 'V1', step_number: 1, event_type: 'WARNING', action_name: 'Warning', fine_amount: 0, status: 'PENDING_BOARD_APPROVAL', override: 'N', override_reason: '', ...over.event }
  return { event, violation, rule: parking, steps, events: [event, ...(over.events ?? [])], isFine: Number(event.fine_amount) > 0 }
}

test('plain approval: event APPROVED, no fine, deadline kept, audit says who', () => {
  const p = planDecision(ctx(), { action: 'APPROVE' }, admin, {}, AT)
  assert.equal(p.eventPatch.status, 'APPROVED')
  assert.equal(p.eventPatch.approved_by, 'U1')
  assert.equal(p.eventPatch.override, 'N')
  assert.equal(p.fine, null)
  assert.deepEqual(p.violationPatch, {})
  assert.deepEqual(p.overrides, [])
  assert.equal(p.auditRows.length, 1)
  assert.equal(p.auditRows[0].action, 'ENFORCEMENT_APPROVED')
})

test('deadline edit needs a reason and is recorded as an override', () => {
  assert.throws(() => planDecision(ctx(), { action: 'APPROVE', deadline: '2026-09-30' }, admin, {}, AT), /reason/)
  const p = planDecision(ctx(), { action: 'APPROVE', deadline: '2026-09-30', reason: 'Owner away' }, admin, {}, AT)
  assert.equal(p.violationPatch.actual_deadline, '2026-09-30')
  assert.equal(p.violationPatch.deadline_overridden, 'Y')
  assert.equal(p.violationPatch.deadline_override_by, 'U1')
  assert.equal(p.eventPatch.due_at, '2026-09-30')
  assert.deepEqual(p.overrides, ['deadline'])
  assert.ok(p.auditRows.some(a => a.action === 'DEADLINE_OVERRIDDEN' && a.reason === 'Owner away'))
})

test('fine approval creates a BOARD_APPROVED FINES row included in the PM report', () => {
  const c = ctx({ event: { step_number: 3, event_type: 'FINE', action_name: 'Fine', fine_amount: 50 }, violation: { offense_number: 3 } })
  const p = planDecision(c, { action: 'APPROVE' }, admin, {}, AT)
  assert.equal(p.fine.amount, 50)
  assert.equal(p.fine.status, 'BOARD_APPROVED')
  assert.equal(p.fine.include_in_pm_report, 'Y')
  assert.equal(p.fine.enforcement_event_id, 'E1')
  assert.ok(p.auditRows.some(a => a.action === 'FINE_APPROVED'))
})

test('modifying the fine needs a reason; a $0 modification creates no fine row', () => {
  const c = ctx({ event: { step_number: 3, event_type: 'FINE', action_name: 'Fine', fine_amount: 50 }, violation: { offense_number: 3 } })
  assert.throws(() => planDecision(c, { action: 'APPROVE', fineAmount: 25 }, admin, {}, AT), /reason/)
  assert.throws(() => planDecision(c, { action: 'APPROVE', fineAmount: -5, reason: 'x' }, admin, {}, AT), /non-negative/)
  const p = planDecision(c, { action: 'APPROVE', fineAmount: 25, reason: 'Hardship' }, admin, {}, AT)
  assert.equal(p.fine.amount, 25)
  assert.equal(p.eventPatch.fine_amount, 25)
  assert.equal(p.eventPatch.override, 'Y')
  assert.ok(p.auditRows.some(a => a.action === 'FINE_MODIFIED'))
  const zero = planDecision(c, { action: 'APPROVE', fineAmount: 0, reason: 'Waived' }, admin, {}, AT)
  assert.equal(zero.fine, null)
})

test('ARC member cannot approve a fine unless HOA_SETTINGS allows it', () => {
  const c = ctx({ event: { step_number: 3, event_type: 'FINE', action_name: 'Fine', fine_amount: 50 } })
  assert.throws(() => planDecision(c, { action: 'APPROVE' }, arc, {}, AT), /cannot approve enforcement/)
  assert.throws(() => planDecision(c, { action: 'APPROVE' }, pm, {}, AT), /cannot approve enforcement/)
  const member = { id: 'U4', name: 'Member', role: 'BOARD_MEMBER' }
  assert.equal(planDecision(c, { action: 'APPROVE' }, member, {}, AT).fine.amount, 50)
})

test('enforcement override to another configured step: action, fine, deadline recomputed, audited', () => {
  // Override the step-1 warning up to step 3 ($50 fine). Parking has no step deadline; rule default is 7 days.
  assert.throws(() => planDecision(ctx(), { action: 'APPROVE', stepNumber: 3 }, admin, {}, AT), /reason/)
  assert.throws(() => planDecision(ctx(), { action: 'APPROVE', stepNumber: 9, reason: 'x' }, admin, {}, AT), /not configured/)
  const p = planDecision(ctx(), { action: 'APPROVE', stepNumber: 3, reason: 'Repeat offender per Board vote' }, admin, {}, AT)
  assert.equal(p.eventPatch.step_number, 3)
  assert.equal(p.eventPatch.action_name, steps[2].action_name)
  assert.equal(p.eventPatch.fine_amount, 50)
  assert.equal(p.eventPatch.event_type, 'FINE')
  assert.equal(p.eventPatch.override, 'Y')
  assert.equal(p.fine.amount, 50)
  assert.equal(p.violationPatch.offense_number, 3)
  assert.equal(p.violationPatch.actual_deadline, '2026-09-24') // today + 7
  assert.equal(p.violationPatch.deadline_overridden, undefined) // recomputed, not an override
  assert.deepEqual(p.overrides, ['enforcement'])
  assert.ok(p.auditRows.some(a => a.action === 'ENFORCEMENT_OVERRIDDEN'))
})

test('reject on a fresh case closes it and returns it to the submitter', () => {
  assert.throws(() => planDecision(ctx(), { action: 'REJECT' }, admin, {}, AT), /reason/)
  const p = planDecision(ctx(), { action: 'REJECT', reason: 'Wrong property' }, admin, {}, AT)
  assert.equal(p.eventPatch.status, 'REJECTED')
  assert.equal(p.closesCase, true)
  assert.equal(p.violationPatch.status, 'CLOSED')
  assert.match(p.violationPatch.compliance_notes, /Wrong property/)
  assert.ok(p.auditRows.some(a => a.action === 'CASE_RETURNED_TO_SUBMITTER'))
})

test('reject on a progression keeps the case open at the last approved step', () => {
  const c = ctx({
    event: { id: 'E2', step_number: 2, action_name: 'Final Warning', event_type: 'FINAL_WARNING' },
    violation: { offense_number: 2 },
    events: [{ id: 'E1', violation_id: 'V1', step_number: 1, status: 'APPROVED' }],
  })
  const p = planDecision(c, { action: 'REJECT', reason: 'Not a repeat' }, admin, {}, AT)
  assert.equal(p.closesCase, false)
  assert.deepEqual(p.violationPatch, { offense_number: 1 })
})

test('already-decided event is refused', () => {
  assert.throws(() => planDecision(ctx({ event: { status: 'APPROVED' } }), { action: 'APPROVE' }, admin, {}, AT), /already been decided/)
})

test('approval with no deadline anywhere is refused unless the step is manual action', () => {
  const noise = RULES.find(r => r.id === 'RULE-001')
  const c = { ...ctx({ violation: { rule_id: 'RULE-001', actual_deadline: '', default_deadline: '' } }), rule: noise, steps: RULE_STEPS.filter(s => s.rule_id === 'RULE-001') }
  assert.throws(() => planDecision(c, { action: 'APPROVE' }, admin, {}, AT), /deadline is required/)
  const p = planDecision(c, { action: 'APPROVE', deadline: '2026-10-01', reason: 'Board set 14 days' }, admin, {}, AT)
  assert.equal(p.violationPatch.actual_deadline, '2026-10-01')
})

test('planCompliance closes the case, records verifier, cancels pending events', () => {
  const v = { id: 'V1', status: 'OPEN' }
  const events = [
    { id: 'E1', violation_id: 'V1', status: 'APPROVED' },
    { id: 'E2', violation_id: 'V1', status: 'PENDING_BOARD_APPROVAL' },
    { id: 'E3', violation_id: 'V9', status: 'PENDING_BOARD_APPROVAL' },
  ]
  assert.throws(() => planCompliance(v, events, pm, '', AT), /cannot confirm/)
  const p = planCompliance(v, events, arc, 'Verified 9/17', AT)
  assert.equal(p.violationPatch.status, 'CLOSED')
  assert.equal(p.violationPatch.compliance_status, 'COMPLIANT')
  assert.equal(p.violationPatch.compliance_date, '2026-09-17')
  assert.equal(p.violationPatch.compliance_verified_by, 'U2')
  assert.deepEqual(p.eventPatches.map(e => e.id), ['E2'])
  assert.equal(p.auditRows.length, 2)
  assert.throws(() => planCompliance({ id: 'V1', status: 'CLOSED' }, [], arc, '', AT), /already closed/)
})

test('joinPending joins each pending event with its case, rule, property, and steps', () => {
  const data = {
    VIOLATIONS: [{ id: 'V1', rule_id: 'RULE-008', property_id: 'P1' }],
    PROPERTIES: [{ id: 'P1', property_address: '3482 Park Creek Lane' }],
    VIOLATION_RULES: [parking],
    RULE_ENFORCEMENT_STEPS: RULE_STEPS,
    ENFORCEMENT_EVENTS: [
      { id: 'E1', violation_id: 'V1', status: 'APPROVED', fine_amount: 0, created_at: '2026-09-01' },
      { id: 'E2', violation_id: 'V1', status: 'PENDING_BOARD_APPROVAL', fine_amount: 50, created_at: '2026-09-10' },
      { id: 'E9', violation_id: 'V-missing', status: 'PENDING_BOARD_APPROVAL', fine_amount: 0, created_at: '2026-09-11' },
    ],
  }
  const items = joinPending(data)
  assert.equal(items.length, 1)
  assert.equal(items[0].event.id, 'E2')
  assert.equal(items[0].isFine, true)
  assert.equal(items[0].property.property_address, '3482 Park Creek Lane')
  assert.equal(items[0].steps.length, 4)
  assert.equal(items[0].events.length, 2)
})
