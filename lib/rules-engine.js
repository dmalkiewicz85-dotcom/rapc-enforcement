// The rules engine. Pure functions over plain row objects — no Sheets access —
// so the same determination runs in tests, in the API, and in the preview the
// Board sees before approving.
//
// It answers: given a rule, its configured steps, and this ownership's history,
// what offense level is this, what action does the guide prescribe, what is the
// deadline, is there a fine, and which template renders it.
//
// Board members never pick First/Second/Third offense by hand (spec, RULES ENGINE).

import { addDays, toDateISO } from './time.js'

const yes = v => String(v).toUpperCase() === 'Y'
const num = (v, fallback = null) => (v === '' || v == null || Number.isNaN(Number(v)) ? fallback : Number(v))

// ---------------------------------------------------------------------------
// Offense determination
//
// CRITICAL COMPLIANCE RULE: a case confirmed compliant is closed and the count
// resets, so a new occurrence after that is a first offense. An unresolved case
// keeps progressing through its steps.
//
// Inputs are scoped to ONE property + ONE ownership. History from a previous
// owner never counts (OWNERSHIP CHANGE LOGIC).
// ---------------------------------------------------------------------------

/**
 * @param {object} rule           VIOLATION_RULES row
 * @param {object[]} steps        RULE_ENFORCEMENT_STEPS rows for this rule
 * @param {object|null} openCase  the OPEN VIOLATIONS row for this rule+ownership, if any
 * @param {object[]} openCaseEvents  ENFORCEMENT_EVENTS for that open case
 * @param {object[]} closedCases  CLOSED VIOLATIONS rows for this rule+ownership
 * @param {string} asOf           ISO date the determination is made
 */
export function determineOffense({ rule, steps, openCase, openCaseEvents = [], closedCases = [], asOf }) {
  const ordered = [...steps].sort((a, b) => num(a.step_number) - num(b.step_number))
  if (!ordered.length) throw new Error(`Rule ${rule.id} has no enforcement steps configured.`)

  let offenseNumber
  let basis

  if (openCase) {
    // Unresolved: progress to the step after the highest one already issued.
    const issued = openCaseEvents
      .filter(e => e.status === 'APPROVED')
      .map(e => num(e.step_number, 0))
    const highest = issued.length ? Math.max(...issued) : num(openCase.offense_number, 0)
    offenseNumber = highest + 1
    basis = `Open case ${openCase.case_number} at step ${highest}; unresolved, so progressing to step ${offenseNumber}.`
  } else if (yes(rule.reset_on_compliance)) {
    offenseNumber = 1
    basis = 'No open case for this rule and ownership; reset_on_compliance=Y, so this is a first offense.'
  } else {
    // Guide-style window counting, only used when the Board turns reset off.
    const windowDays = num(rule.offense_window_days)
    const cutoff = windowDays ? addDays(asOf, -windowDays) : null
    const prior = closedCases.filter(c => !cutoff || c.date_observed >= cutoff).length
    offenseNumber = prior + 1
    basis = `reset_on_compliance=N; ${prior} prior case(s) within ${windowDays ?? 'unbounded'} day window, so offense ${offenseNumber}.`
  }

  // Past the last configured step, the last step repeats if it is recurring
  // ("subsequent offenses"); otherwise it is manual Board action.
  const last = ordered[ordered.length - 1]
  const stepRow = ordered.find(s => num(s.step_number) === offenseNumber)
    ?? (yes(last.is_recurring) || yes(last.manual_action_required) ? last : null)

  if (!stepRow) {
    throw new Error(`Rule ${rule.id} has no step ${offenseNumber} and its last step does not repeat.`)
  }

  return { offenseNumber, step: stepRow, basis }
}

// ---------------------------------------------------------------------------
// Deadline: Notice Date + configured days. Step days win over the rule default.
// Returns null when neither is configured — the UI must then require an override.
// ---------------------------------------------------------------------------
export function defaultDeadline(rule, step, noticeDate) {
  const days = num(step.deadline_days) ?? num(rule.default_deadline_days)
  if (days == null) return null
  return addDays(toDateISO(noticeDate), days)
}

// ---------------------------------------------------------------------------
// Full determination for the Enforcement Determination screen.
// ---------------------------------------------------------------------------
export function determineEnforcement(ctx) {
  const { rule } = ctx
  const noticeDate = ctx.noticeDate ?? ctx.asOf
  const { offenseNumber, step, basis } = determineOffense(ctx)
  const fine = num(step.fine_amount, 0)

  return {
    ruleId: rule.id,
    ruleName: rule.name,
    offenseNumber,
    stepNumber: num(step.step_number),
    stepId: step.id,
    actionName: step.action_name,
    eventType: eventTypeFor(step),
    templateType: step.template_type || (yes(step.is_final_warning) ? 'FINAL_WARNING' : 'STANDARD_WARNING'),
    fineAmount: fine,
    isFine: fine > 0,
    isFinalWarning: yes(step.is_final_warning),
    isRecurring: yes(step.is_recurring),
    recurrenceDays: num(step.recurrence_days),
    requiresBoardApproval: yes(step.requires_board_approval),
    manualActionRequired: yes(step.manual_action_required),
    defaultDeadline: defaultDeadline(rule, step, noticeDate),
    basis,
  }
}

export function eventTypeFor(step) {
  if (yes(step.manual_action_required) && num(step.fine_amount, 0) === 0) return 'MANUAL_ACTION'
  if (num(step.fine_amount, 0) > 0) return 'FINE'
  if (yes(step.is_final_warning)) return 'FINAL_WARNING'
  return 'WARNING'
}

// ---------------------------------------------------------------------------
// Recurring fines: the next event is due `recurrence_days` after the previous
// approved recurring event. Returns null if nothing is due (or the case is
// closed, or the interval is not configured — those recur per occurrence and
// are triggered by a new submission instead).
// ---------------------------------------------------------------------------
export function nextRecurringFineDue({ violation, step, events, asOf }) {
  if (violation.status !== 'OPEN') return null
  if (!yes(step.is_recurring)) return null
  const every = num(step.recurrence_days)
  if (!every) return null

  const approved = events
    .filter(e => e.status === 'APPROVED' && num(e.step_number) >= num(step.step_number))
    .map(e => toDateISO(e.approved_at))
    .sort()
  const lastAt = approved[approved.length - 1]
  if (!lastAt) return null

  const pendingExists = events.some(e => e.status === 'PENDING_BOARD_APPROVAL' && num(e.step_number) >= num(step.step_number))
  if (pendingExists) return null

  const due = addDays(lastAt, every)
  return due <= toDateISO(asOf) ? { dueAt: due, fineAmount: num(step.fine_amount, 0) } : null
}

// Overdue = open and today is past the actual deadline.
export function daysOverdue(violation, asOf) {
  if (violation.status !== 'OPEN' || !violation.actual_deadline) return 0
  const ms = new Date(toDateISO(asOf)) - new Date(violation.actual_deadline)
  return Math.max(0, Math.floor(ms / 86_400_000))
}
