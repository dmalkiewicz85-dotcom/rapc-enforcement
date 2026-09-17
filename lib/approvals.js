// Board approval workflow and compliance confirmation.
//
// planDecision() and planCompliance() are pure: they take the joined case,
// the decision, and the acting user, and return the row patches and audit
// entries. decideEvent() / confirmCompliance() read, plan, and apply with
// writeSteps. Every override (deadline, fine, enforcement step) demands a
// reason and lands in AUDIT_LOG (spec, BOARD APPROVAL / FINE APPROVAL).
//
// Approval marks the event APPROVED and, for a fine, creates the FINES row.
// Generating the notice PDF, filing it in Drive and emailing it are
// lib/notices.js (Phases 6–8); until then afterApproval() records that the
// notice is still to be generated so nothing is silently skipped.

import { readTabs, appendRows, updateRow, updateRows, writeSteps } from './sheets.js'
import { can } from './schema.js'
import { defaultDeadline, eventTypeFor } from './rules-engine.js'
import { newId } from './ids.js'
import { nowISO, toDateISO } from './time.js'
import { afterApproval } from './notices.js'

const num = v => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v))

export const APPROVAL_TABS = [
  'VIOLATIONS', 'ENFORCEMENT_EVENTS', 'PROPERTIES', 'OWNERS', 'VIOLATION_RULES',
  'RULE_ENFORCEMENT_STEPS', 'FINES',
]

// Joins one pending event with everything the approval screen needs.
export function joinPending(data) {
  const v = new Map(data.VIOLATIONS.map(x => [x.id, x]))
  const p = new Map(data.PROPERTIES.map(x => [x.id, x]))
  const r = new Map(data.VIOLATION_RULES.map(x => [x.id, x]))
  return data.ENFORCEMENT_EVENTS
    .filter(e => e.status === 'PENDING_BOARD_APPROVAL')
    .map(e => {
      const violation = v.get(e.violation_id)
      if (!violation) return null
      const rule = r.get(violation.rule_id) ?? null
      return {
        event: e, violation, rule,
        property: p.get(violation.property_id) ?? null,
        steps: data.RULE_ENFORCEMENT_STEPS.filter(s => s.rule_id === violation.rule_id)
          .sort((a, b) => Number(a.step_number) - Number(b.step_number)),
        events: data.ENFORCEMENT_EVENTS.filter(x => x.violation_id === violation.id),
        isFine: num(e.fine_amount) > 0,
      }
    })
    .filter(Boolean)
    .sort((a, b) => String(a.event.created_at).localeCompare(String(b.event.created_at)))
}

function auditRow(user, at) {
  return (entity_type, entity_id, action, old_value, new_value, reason = '') => ({
    id: newId('AUD'), user_id: user.id, user_name: user.name, entity_type, entity_id, action,
    old_value: old_value == null ? '' : JSON.stringify(old_value),
    new_value: new_value == null ? '' : JSON.stringify(new_value),
    reason, created_at: at,
  })
}

// decision: {
//   action: 'APPROVE' | 'REJECT',
//   reason,                 required for REJECT and for any override below
//   fineAmount,             modify the recommended fine (override)
//   deadline,               edit the compliance deadline (override)
//   stepNumber,             override enforcement to another configured step
// }
// Returns { eventPatch, violationPatch, fine, auditRows, closesCase, overrides }.
export function planDecision(ctx, decision, user, settings = {}, at = nowISO()) {
  const { event, violation, rule, steps, events } = ctx
  const audit = auditRow(user, at)
  const reason = String(decision.reason ?? '').trim()
  const auditRows = []
  const overrides = []

  if (!can(user, 'approve_enforcement')) throw new Error('Your role cannot approve enforcement')
  if (event.status !== 'PENDING_BOARD_APPROVAL') throw new Error('This event has already been decided')

  if (decision.action === 'REJECT') {
    if (!reason) throw new Error('A reason is required to reject')
    const approvedSteps = events.filter(e => e.status === 'APPROVED').map(e => Number(e.step_number))
    const closesCase = approvedSteps.length === 0
    const violationPatch = closesCase
      ? { status: 'CLOSED', closed_at: at, compliance_notes: `Returned by Board: ${reason}` }
      : { offense_number: Math.max(...approvedSteps) }
    auditRows.push(audit('ENFORCEMENT_EVENT', event.id, 'ENFORCEMENT_REJECTED', { status: event.status }, { status: 'REJECTED' }, reason))
    if (closesCase) auditRows.push(audit('VIOLATION', violation.id, 'CASE_RETURNED_TO_SUBMITTER', { status: violation.status }, { status: 'CLOSED' }, reason))
    return {
      eventPatch: { status: 'REJECTED', approved_at: at, approved_by: user.id, override_reason: reason },
      violationPatch, fine: null, auditRows, closesCase, overrides,
    }
  }

  if (decision.action !== 'APPROVE') throw new Error('Unknown decision')

  // Enforcement override: a different configured step for this rule.
  let step = steps.find(s => Number(s.step_number) === Number(event.step_number)) ?? null
  let stepNumber = Number(event.step_number)
  let actionName = event.action_name
  let fineAmount = num(event.fine_amount) ?? 0
  let eventType = event.event_type
  if (decision.stepNumber != null && Number(decision.stepNumber) !== stepNumber) {
    const target = steps.find(s => Number(s.step_number) === Number(decision.stepNumber))
    if (!target) throw new Error(`Step ${decision.stepNumber} is not configured for ${rule?.name ?? violation.rule_id}`)
    if (!reason) throw new Error('A reason is required to override the enforcement level')
    overrides.push('enforcement')
    auditRows.push(audit('ENFORCEMENT_EVENT', event.id, 'ENFORCEMENT_OVERRIDDEN',
      { step: stepNumber, action: actionName, fine: fineAmount }, { step: Number(target.step_number), action: target.action_name, fine: num(target.fine_amount) ?? 0 }, reason))
    step = target
    stepNumber = Number(target.step_number)
    actionName = target.action_name
    fineAmount = num(target.fine_amount) ?? 0
    eventType = eventTypeFor(target)
  }

  // Fine modification.
  if (decision.fineAmount != null && decision.fineAmount !== '' && Number(decision.fineAmount) !== fineAmount) {
    const modified = Number(decision.fineAmount)
    if (Number.isNaN(modified) || modified < 0) throw new Error('Fine must be a non-negative amount')
    if (!reason) throw new Error('A reason is required to modify the fine')
    overrides.push('fine')
    auditRows.push(audit('ENFORCEMENT_EVENT', event.id, 'FINE_MODIFIED', { fine: fineAmount }, { fine: modified }, reason))
    fineAmount = modified
    if (modified > 0 && eventType !== 'FINE') eventType = 'FINE'
  }
  if (fineAmount > 0 && !can(user, 'approve_fines', settings)) throw new Error('Your role cannot approve fines')

  // Deadline: a plain approval keeps what the submitter set; an enforcement
  // override recomputes from the new step off today's notice date; the Board
  // may set a different date with a reason.
  const recomputed = step && rule ? defaultDeadline(rule, step, toDateISO(at)) : null
  const current = violation.actual_deadline || null
  const deadline = decision.deadline
    ? toDateISO(decision.deadline)
    : overrides.includes('enforcement') ? (recomputed ?? current) : (current ?? recomputed)
  const violationPatch = {}
  if (!deadline && eventType !== 'MANUAL_ACTION') throw new Error('A compliance deadline is required')
  if (deadline && deadline !== current) {
    const isOverride = Boolean(decision.deadline) && deadline !== recomputed
    if (isOverride && !reason) throw new Error('A reason is required to change the deadline')
    if (isOverride) {
      overrides.push('deadline')
      Object.assign(violationPatch, {
        deadline_overridden: 'Y', deadline_override_reason: reason, deadline_override_by: user.id, deadline_override_at: at,
      })
      auditRows.push(audit('VIOLATION', violation.id, 'DEADLINE_OVERRIDDEN', { deadline: current }, { deadline }, reason))
    }
    Object.assign(violationPatch, { actual_deadline: deadline, default_deadline: recomputed ?? violation.default_deadline ?? '' })
  }
  if (stepNumber !== Number(violation.offense_number)) violationPatch.offense_number = stepNumber

  const eventPatch = {
    status: 'APPROVED', approved_at: at, approved_by: user.id,
    step_number: stepNumber, action_name: actionName, fine_amount: fineAmount, event_type: eventType,
    due_at: deadline ?? '',
    override: overrides.length ? 'Y' : (event.override === 'Y' ? 'Y' : 'N'),
    override_reason: overrides.length ? reason : event.override_reason,
  }

  const fine = fineAmount > 0 ? {
    id: newId('FINE'), violation_id: violation.id, enforcement_event_id: event.id, amount: fineAmount,
    status: 'BOARD_APPROVED', approved_at: at, approved_by: user.id, include_in_pm_report: 'Y',
    sent_to_pm_at: '', pm_assessed_at: '', pm_reference: '', pm_notes: '',
  } : null

  auditRows.push(audit('ENFORCEMENT_EVENT', event.id, fineAmount > 0 ? 'FINE_APPROVED' : 'ENFORCEMENT_APPROVED',
    { status: event.status }, { status: 'APPROVED', step: stepNumber, action: actionName, fine: fineAmount, deadline }, reason))
  if (fine) auditRows.push(audit('FINE', fine.id, 'FINE_CREATED', null, { amount: fineAmount, status: fine.status }))

  return { eventPatch, violationPatch, fine, auditRows, closesCase: false, overrides }
}

export async function loadPendingApprovals() {
  return joinPending(await readTabs(...APPROVAL_TABS))
}

export async function decideEvent(eventId, decision, user, settings = {}) {
  const data = await readTabs(...APPROVAL_TABS)
  const ctx = joinPending(data).find(c => c.event.id === eventId)
  if (!ctx) throw new Error('Pending event not found — it may already have been decided')
  const at = nowISO()
  const plan = planDecision(ctx, decision, user, settings, at)

  const steps = [
    ['event', () => updateRow('ENFORCEMENT_EVENTS', eventId, plan.eventPatch)],
  ]
  if (Object.keys(plan.violationPatch).length) {
    steps.push(['violation', () => updateRow('VIOLATIONS', ctx.violation.id, plan.violationPatch)])
  }
  if (plan.fine) steps.push(['fine', () => appendRows('FINES', [plan.fine])])
  if (plan.eventPatch.status === 'APPROVED') {
    steps.push(['notice', () => afterApproval({
      ...ctx, event: { ...ctx.event, ...plan.eventPatch }, violation: { ...ctx.violation, ...plan.violationPatch },
      owner: data.OWNERS.find(o => o.id === ctx.violation.owner_id) ?? null, user, at,
    })])
  }
  steps.push(['audit', r => appendRows('AUDIT_LOG', [...plan.auditRows, ...(r.notice?.auditRows ?? [])])])

  const results = await writeSteps(steps)
  return { ...plan, notice: results.notice ?? null }
}

// MARK COMPLIANT (spec): close the case, record who/when, cancel anything
// still pending on it, and keep every row.
export function planCompliance(violation, events, user, notes = '', at = nowISO()) {
  if (!can(user, 'mark_compliant')) throw new Error('Your role cannot confirm compliance')
  if (violation.status !== 'OPEN') throw new Error('This case is already closed')
  const audit = auditRow(user, at)
  const today = toDateISO(at)
  const pending = events.filter(e => e.violation_id === violation.id && e.status === 'PENDING_BOARD_APPROVAL')
  const violationPatch = {
    status: 'CLOSED', closed_at: at, compliance_status: 'COMPLIANT', compliance_date: today,
    compliance_verified_by: user.id, compliance_notes: String(notes ?? '').trim(),
  }
  const eventPatches = pending.map(e => ({ id: e.id, patch: { status: 'CANCELLED', override_reason: 'Compliance confirmed' } }))
  const auditRows = [
    audit('VIOLATION', violation.id, 'MARKED_COMPLIANT', { status: 'OPEN' }, { status: 'CLOSED', compliance_date: today }, violationPatch.compliance_notes),
    ...pending.map(e => audit('ENFORCEMENT_EVENT', e.id, 'EVENT_CANCELLED', { status: e.status }, { status: 'CANCELLED' }, 'Compliance confirmed')),
  ]
  return { violationPatch, eventPatches, auditRows }
}

export async function confirmCompliance(violationId, user, notes) {
  const data = await readTabs('VIOLATIONS', 'ENFORCEMENT_EVENTS')
  const violation = data.VIOLATIONS.find(v => v.id === violationId)
  if (!violation) throw new Error('Case not found')
  const plan = planCompliance(violation, data.ENFORCEMENT_EVENTS, user, notes)
  await writeSteps([
    ['violation', () => updateRow('VIOLATIONS', violationId, plan.violationPatch)],
    ['cancel_events', () => updateRows('ENFORCEMENT_EVENTS', plan.eventPatches)],
    ['audit', () => appendRows('AUDIT_LOG', plan.auditRows)],
  ])
  return plan
}
