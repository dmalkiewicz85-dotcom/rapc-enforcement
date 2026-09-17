import { currentUser } from '@/lib/current-user'
import { can } from '@/lib/schema'
import { submitViolation } from '@/lib/violations'

export const dynamic = 'force-dynamic'

// Creates the case (or progresses the open one) and a PENDING_BOARD_APPROVAL
// event. Nothing is emailed here — that happens on Board approval.
export async function POST(req) {
  const user = await currentUser()
  if (!can(user, 'submit')) return Response.json({ error: 'You cannot submit violations' }, { status: 403 })
  const body = await req.json()
  try {
    const { violation, event, progressed } = await submitViolation(body, user)
    return Response.json({ ok: true, id: violation.id, caseNumber: violation.case_number, eventId: event.id, progressed })
  } catch (e) {
    if (e.completedSteps) {
      return Response.json({ error: e.message, completedSteps: e.completedSteps, failedStep: e.failedStep }, { status: 500 })
    }
    return Response.json({ error: e.message }, { status: 400 })
  }
}
