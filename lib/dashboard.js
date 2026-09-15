// Reads everything the dashboard needs in one batchGet and derives the counts.
// Pure derivation is split out so it can be tested without Sheets.

import { readTabs } from './sheets.js'
import { daysOverdue } from './rules-engine.js'
import { todayISO } from './time.js'

export async function loadDashboard() {
  const data = await readTabs(
    'VIOLATIONS', 'ENFORCEMENT_EVENTS', 'FINES', 'APPEALS', 'PROPERTIES', 'VIOLATION_RULES',
  )
  return deriveDashboard(data, todayISO())
}

export function deriveDashboard(d, today) {
  const props = new Map(d.PROPERTIES.map(p => [p.id, p]))
  const rules = new Map(d.VIOLATION_RULES.map(r => [r.id, r]))
  const vById = new Map(d.VIOLATIONS.map(v => [v.id, v]))

  const open = d.VIOLATIONS.filter(v => v.status === 'OPEN')
  const pendingEvents = d.ENFORCEMENT_EVENTS.filter(e => e.status === 'PENDING_BOARD_APPROVAL')
  const pendingFineEvents = pendingEvents.filter(e => Number(e.fine_amount) > 0)
  const finesPendingPM = d.FINES.filter(f => ['BOARD_APPROVED', 'READY_FOR_PM'].includes(f.status))
  const overdue = open
    .map(v => ({ v, days: daysOverdue(v, today) }))
    .filter(x => x.days > 0)
    .sort((a, b) => b.days - a.days)
  const openAppeals = d.APPEALS.filter(a => a.status !== 'DECIDED')

  const describe = v => ({
    id: v.id,
    caseNumber: v.case_number,
    property: props.get(v.property_id)?.property_address ?? v.property_id,
    rule: rules.get(v.rule_id)?.name ?? v.rule_id,
    offense: Number(v.offense_number) || null,
    deadline: v.actual_deadline || v.default_deadline || '',
  })

  return {
    cards: {
      openViolations: open.length,
      awaitingApproval: pendingEvents.length - pendingFineEvents.length,
      finesAwaitingApproval: pendingFineEvents.length,
      finesPendingPM: finesPendingPM.length,
      overdueFollowUps: overdue.length,
      openAppeals: openAppeals.length,
    },
    actionRequired: pendingEvents
      .map(e => {
        const v = vById.get(e.violation_id)
        if (!v) return null
        return {
          ...describe(v),
          eventId: e.id,
          action: e.action_name,
          fine: Number(e.fine_amount) || 0,
          stepNumber: Number(e.step_number),
        }
      })
      .filter(Boolean),
    overdue: overdue.map(({ v, days }) => ({ ...describe(v), daysOverdue: days })),
  }
}
