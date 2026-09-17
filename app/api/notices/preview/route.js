import { currentUser } from '@/lib/current-user'
import { can } from '@/lib/schema'
import { readTabs, readSettings } from '@/lib/sheets'
import { buildLetterModel } from '@/lib/letter'
import { renderNoticePdf } from '@/lib/pdf'
import { todayISO } from '@/lib/time'

export const dynamic = 'force-dynamic'

// Renders the notice for one enforcement event from live data, for the Board
// to review or print. Not a delivery: no NOTICES row, no Drive, no email.
export async function GET(req) {
  const user = await currentUser()
  if (!can(user, 'review') && !can(user, 'view_history')) return Response.json({ error: 'Not allowed' }, { status: 403 })
  const eventId = new URL(req.url).searchParams.get('event')
  const [d, settings] = await Promise.all([
    readTabs('ENFORCEMENT_EVENTS', 'VIOLATIONS', 'VIOLATION_RULES', 'PROPERTIES', 'OWNERS'), readSettings(),
  ])
  const event = d.ENFORCEMENT_EVENTS.find(e => e.id === eventId)
  const violation = event && d.VIOLATIONS.find(v => v.id === event.violation_id)
  if (!violation) return Response.json({ error: 'Event not found' }, { status: 404 })
  try {
    const model = buildLetterModel({
      violation, event,
      rule: d.VIOLATION_RULES.find(r => r.id === violation.rule_id),
      property: d.PROPERTIES.find(p => p.id === violation.property_id),
      owner: d.OWNERS.find(o => o.id === violation.owner_id),
      settings, noticeDate: event.approved_at || todayISO(),
    })
    const bytes = await renderNoticePdf(model)
    return new Response(bytes, {
      headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${violation.case_number}-step${event.step_number}.pdf"` },
    })
  } catch (e) {
    return Response.json({ error: e.message, missing: e.missing ?? [] }, { status: 422 })
  }
}
