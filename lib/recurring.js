// Recurring fine engine (spec, RECURRING FINE ENGINE). For every OPEN case
// whose current step is recurring with a calendar interval, schedule the
// next fine as a PENDING_BOARD_APPROVAL event once the interval has elapsed
// since the last approved one. Nothing is assessed or sent here; the Board
// approves each recurrence like any other event. Per-occurrence recurrences
// (blank recurrence_days) are triggered by a new submission, not by this.
//
// Idempotent: nextRecurringFineDue() returns null while a pending event
// already exists, so running it twice never double-schedules.

import { readTabs, appendRows, writeSteps } from './sheets.js'
import { nextRecurringFineDue } from './rules-engine.js'
import { newId } from './ids.js'
import { nowISO, todayISO } from './time.js'

const num = v => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v))

export const SYSTEM_USER = { id: 'SYSTEM', name: 'System' }

// Pure. data: { VIOLATIONS, ENFORCEMENT_EVENTS, RULE_ENFORCEMENT_STEPS }
// Returns { events, auditRows } to append.
export function planRecurringFines(data, today, user = SYSTEM_USER, at = nowISO()) {
  const events = []
  const auditRows = []
  for (const v of data.VIOLATIONS) {
    if (v.status !== 'OPEN') continue
    const caseEvents = data.ENFORCEMENT_EVENTS.filter(e => e.violation_id === v.id)
    const approved = caseEvents.filter(e => e.status === 'APPROVED').map(e => num(e.step_number) ?? 0)
    if (!approved.length) continue
    const current = Math.max(...approved)
    const steps = data.RULE_ENFORCEMENT_STEPS.filter(s => s.rule_id === v.rule_id)
      .sort((a, b) => num(a.step_number) - num(b.step_number))
    if (!steps.length) continue
    // The step in force: the one matching the highest approved step, or the
    // last configured step when the case has progressed past the table.
    const step = steps.find(s => num(s.step_number) === current) ?? steps[steps.length - 1]
    const due = nextRecurringFineDue({ violation: v, step, events: caseEvents, asOf: today })
    if (!due) continue
    const e = {
      id: newId('EVT'), violation_id: v.id, step_number: num(step.step_number), event_type: 'FINE',
      action_name: step.action_name, fine_amount: due.fineAmount, status: 'PENDING_BOARD_APPROVAL',
      due_at: v.actual_deadline || '', created_at: at, approved_at: '', approved_by: '', override: 'N', override_reason: '',
    }
    events.push(e)
    auditRows.push({
      id: newId('AUD'), user_id: user.id, user_name: user.name, entity_type: 'ENFORCEMENT_EVENT', entity_id: e.id,
      action: 'RECURRING_FINE_SCHEDULED', old_value: '',
      new_value: JSON.stringify({ case: v.case_number, step: e.step_number, fine: e.fine_amount, was_due: due.dueAt }),
      reason: `Recurring every ${step.recurrence_days} days while ${v.case_number} remains open; awaiting Board approval`,
      created_at: at,
    })
  }
  return { events, auditRows }
}

export async function runRecurringFines(user = SYSTEM_USER) {
  const data = await readTabs('VIOLATIONS', 'ENFORCEMENT_EVENTS', 'RULE_ENFORCEMENT_STEPS')
  const plan = planRecurringFines(data, todayISO(), user)
  if (plan.events.length) {
    await writeSteps([
      ['events', () => appendRows('ENFORCEMENT_EVENTS', plan.events)],
      ['audit', () => appendRows('AUDIT_LOG', plan.auditRows)],
    ])
  }
  return { scheduled: plan.events.length }
}
