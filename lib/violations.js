// Violation submission and case reading.
//
// buildDetermination() is pure: given the tabs and a submission, it resolves
// the property's current ownership, finds the open case for that rule and
// ownership (if any), and runs the rules engine. The same function backs the
// Enforcement Determination preview and the write, so what the submitter saw
// is what gets recorded.
//
// A new observation while a case for the same rule and owner is still OPEN
// progresses that case (next step, new PENDING event) instead of opening a
// second one — that is the "unresolved violation continues through its
// progression" rule. Confirmed compliance closes the case, so the next
// observation after that is a fresh first offense.

import { readTabs, appendRow, appendRows, updateRow, writeSteps } from './sheets.js'
import { determineEnforcement } from './rules-engine.js'
import { newId, nextCaseNumber } from './ids.js'
import { nowISO, todayISO, toDateISO } from './time.js'

export const VIOLATION_TABS = [
  'PROPERTIES', 'OWNERS', 'PROPERTY_OWNERSHIP', 'VIOLATION_RULES', 'RULE_ENFORCEMENT_STEPS',
  'VIOLATIONS', 'ENFORCEMENT_EVENTS',
]

export function currentOwnership(data, propertyId) {
  const ownership = data.PROPERTY_OWNERSHIP.find(o => o.property_id === propertyId && o.active === 'Y' && !o.end_date) ?? null
  const owner = ownership ? data.OWNERS.find(o => o.id === ownership.owner_id) ?? null : null
  return { ownership, owner }
}

// input: { propertyId, ruleId, dateObserved }
// Throws with a plain message when the submission cannot be determined.
export function buildDetermination(data, { propertyId, ruleId, dateObserved }) {
  const property = data.PROPERTIES.find(p => p.id === propertyId)
  if (!property) throw new Error('Property not found')
  if (property.active !== 'Y') throw new Error(`${property.property_address} is inactive`)
  const rule = data.VIOLATION_RULES.find(r => r.id === ruleId)
  if (!rule) throw new Error('Violation type not found')
  if (rule.active !== 'Y') throw new Error(`${rule.name} is not an active rule`)
  const { ownership, owner } = currentOwnership(data, propertyId)
  if (!ownership || !owner) throw new Error(`${property.property_address} has no current owner on the roster`)

  const asOf = toDateISO(dateObserved) || todayISO()
  const steps = data.RULE_ENFORCEMENT_STEPS.filter(s => s.rule_id === rule.id)
  const mine = data.VIOLATIONS.filter(v => v.rule_id === rule.id && v.ownership_id === ownership.id)
  const openCase = mine.find(v => v.status === 'OPEN') ?? null
  const openCaseEvents = openCase ? data.ENFORCEMENT_EVENTS.filter(e => e.violation_id === openCase.id) : []
  const closedCases = mine.filter(v => v.status === 'CLOSED')

  const determination = determineEnforcement({ rule, steps, openCase, openCaseEvents, closedCases, asOf })
  return { property, owner, ownership, rule, openCase, determination, asOf }
}

export async function previewSubmission(input) {
  const data = await readTabs(...VIOLATION_TABS)
  return buildDetermination(data, input)
}

// Validates the override the submitter typed against the determination.
// Returns { actualDeadline, overridden } or throws.
export function resolveDeadline(determination, { deadlineOverride, overrideReason }) {
  const override = toDateISO(deadlineOverride)
  if (override && override !== determination.defaultDeadline) {
    if (!String(overrideReason ?? '').trim()) throw new Error('A reason is required to override the deadline')
    return { actualDeadline: override, overridden: true }
  }
  if (!determination.defaultDeadline) {
    throw new Error('This rule has no configured deadline; enter a deadline and a reason')
  }
  return { actualDeadline: determination.defaultDeadline, overridden: false }
}

// input: { propertyId, ruleId, dateObserved, description, internalNotes,
//          deadlineOverride, overrideReason }
export async function submitViolation(input, user) {
  const description = String(input.description ?? '').trim()
  if (!description) throw new Error('Violation description is required')
  const dateObserved = toDateISO(input.dateObserved)
  if (!dateObserved) throw new Error('Date observed is required')
  if (dateObserved > todayISO()) throw new Error('Date observed cannot be in the future')

  const data = await readTabs(...VIOLATION_TABS)
  const ctx = buildDetermination(data, { ...input, dateObserved })
  const { property, owner, ownership, rule, openCase, determination: d } = ctx
  const { actualDeadline, overridden } = resolveDeadline(d, input)
  const at = nowISO()
  const internalNotes = String(input.internalNotes ?? '').trim()

  const audit = (entity_type, entity_id, action, old_value, new_value, reason = '') => ({
    id: newId('AUD'), user_id: user.id, user_name: user.name, entity_type, entity_id, action,
    old_value: old_value == null ? '' : JSON.stringify(old_value),
    new_value: new_value == null ? '' : JSON.stringify(new_value),
    reason, created_at: at,
  })

  const event = {
    id: newId('EVT'), violation_id: openCase?.id ?? null, step_number: d.stepNumber, event_type: d.eventType,
    action_name: d.actionName, fine_amount: d.fineAmount, status: 'PENDING_BOARD_APPROVAL',
    due_at: actualDeadline, created_at: at, approved_at: '', approved_by: '', override: 'N', override_reason: '',
  }
  const deadlineFields = {
    default_deadline: d.defaultDeadline ?? '',
    actual_deadline: actualDeadline,
    deadline_overridden: overridden ? 'Y' : 'N',
    deadline_override_reason: overridden ? String(input.overrideReason).trim() : '',
    deadline_override_by: overridden ? user.id : '',
    deadline_override_at: overridden ? at : '',
  }

  let violation
  const steps = []
  if (openCase) {
    // Progress the existing case: bump the offense, restate deadlines, append
    // the new observation to the narrative so the original stays intact.
    const stamp = `[${dateObserved}] `
    const patch = {
      offense_number: d.offenseNumber,
      description: `${openCase.description}\n${stamp}${description}`.trim(),
      internal_notes: internalNotes ? `${openCase.internal_notes}\n${stamp}${internalNotes}`.trim() : openCase.internal_notes,
      ...deadlineFields,
    }
    violation = { ...openCase, ...patch }
    event.violation_id = openCase.id
    steps.push(['violation', () => updateRow('VIOLATIONS', openCase.id, patch)])
  } else {
    violation = {
      id: newId('VIO'),
      case_number: nextCaseNumber(data.VIOLATIONS.map(v => v.case_number), dateObserved.slice(0, 4)),
      property_id: property.id, ownership_id: ownership.id, owner_id: owner.id, rule_id: rule.id,
      date_observed: dateObserved, description, internal_notes: internalNotes,
      status: 'OPEN', offense_number: d.offenseNumber, ...deadlineFields,
      compliance_status: 'PENDING', compliance_date: '', compliance_verified_by: '', compliance_notes: '',
      owner_name_snapshot: owner.name, owner_email_snapshot: owner.email,
      owner_mailing_snapshot: [owner.mailing_address, [owner.mailing_city, owner.mailing_state, owner.mailing_zip].filter(Boolean).join(' ')].filter(Boolean).join(', '),
      created_by: user.id, created_at: at, closed_at: '',
    }
    event.violation_id = violation.id
    steps.push(['violation', () => appendRow('VIOLATIONS', violation)])
  }

  const auditRows = [
    audit('VIOLATION', violation.id, openCase ? 'VIOLATION_PROGRESSED' : 'VIOLATION_SUBMITTED', null, {
      case_number: violation.case_number, property: property.property_address, rule: rule.name,
      date_observed: dateObserved, offense_number: d.offenseNumber, step: d.stepNumber, action: d.actionName,
      fine_amount: d.fineAmount, deadline: actualDeadline,
    }, d.basis),
    audit('ENFORCEMENT_EVENT', event.id, 'EVENT_CREATED', null, { status: event.status, step: d.stepNumber, action: d.actionName, fine_amount: d.fineAmount }),
  ]
  if (overridden) {
    auditRows.push(audit('VIOLATION', violation.id, 'DEADLINE_OVERRIDDEN', { deadline: d.defaultDeadline }, { deadline: actualDeadline }, String(input.overrideReason).trim()))
  }
  steps.push(['event', () => appendRow('ENFORCEMENT_EVENTS', event)])
  steps.push(['audit', () => appendRows('AUDIT_LOG', auditRows)])

  await writeSteps(steps)
  return { violation, event, determination: d, progressed: Boolean(openCase) }
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

function joinViolations(d, today) {
  const props = new Map(d.PROPERTIES.map(p => [p.id, p]))
  const rules = new Map(d.VIOLATION_RULES.map(r => [r.id, r]))
  const eventsByCase = new Map()
  for (const e of d.ENFORCEMENT_EVENTS) {
    if (!eventsByCase.has(e.violation_id)) eventsByCase.set(e.violation_id, [])
    eventsByCase.get(e.violation_id).push(e)
  }
  return d.VIOLATIONS.map(v => {
    const events = (eventsByCase.get(v.id) ?? []).sort((a, b) => Number(a.step_number) - Number(b.step_number) || String(a.created_at).localeCompare(String(b.created_at)))
    const deadline = v.actual_deadline || v.default_deadline || ''
    const overdueDays = v.status === 'OPEN' && deadline && deadline < today
      ? Math.floor((new Date(today) - new Date(deadline)) / 86_400_000) : 0
    return {
      ...v,
      property: props.get(v.property_id) ?? null,
      rule: rules.get(v.rule_id) ?? null,
      events,
      pendingEvent: events.find(e => e.status === 'PENDING_BOARD_APPROVAL') ?? null,
      openAppeals: (d.APPEALS ?? []).filter(a => a.violation_id === v.id && a.status !== 'DECIDED').length,
      deadline,
      overdueDays,
    }
  }).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
}

// filters: { status, ruleId, q, overdue, offense, createdBy, appeals }
export function filterViolations(list, f = {}) {
  const q = String(f.q ?? '').trim().toLowerCase()
  return list.filter(v =>
    (!f.status || v.status === f.status) &&
    (!f.ruleId || v.rule_id === f.ruleId) &&
    (!f.overdue || v.overdueDays > 0) &&
    (!f.offense || String(v.offense_number) === String(f.offense)) &&
    (!f.createdBy || v.created_by === f.createdBy) &&
    (!f.appeals || v.openAppeals > 0) &&
    (!q || (v.property?.property_address ?? '').toLowerCase().includes(q) || (v.owner_name_snapshot ?? '').toLowerCase().includes(q) || (v.case_number ?? '').toLowerCase().includes(q)),
  )
}

export async function loadViolations(filters) {
  const d = await readTabs('VIOLATIONS', 'ENFORCEMENT_EVENTS', 'PROPERTIES', 'VIOLATION_RULES', 'APPEALS')
  return filterViolations(joinViolations(d, todayISO()), filters)
}

export async function loadViolation(id) {
  const d = await readTabs('VIOLATIONS', 'ENFORCEMENT_EVENTS', 'PROPERTIES', 'VIOLATION_RULES', 'NOTICES', 'FINES', 'AUDIT_LOG', 'USERS', 'APPEALS')
  const v = joinViolations(d, todayISO()).find(x => x.id === id)
  if (!v) return null
  const users = new Map(d.USERS.map(u => [u.id, u.name]))
  return {
    ...v,
    notices: d.NOTICES.filter(n => n.violation_id === id),
    fines: d.FINES.filter(f => f.violation_id === id),
    appeals: d.APPEALS.filter(a => a.violation_id === id),
    audit: d.AUDIT_LOG.filter(a => a.entity_id === id || v.events.some(e => e.id === a.entity_id))
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))),
    createdByName: users.get(v.created_by) ?? v.created_by,
    overrideByName: users.get(v.deadline_override_by) ?? v.deadline_override_by,
  }
}
