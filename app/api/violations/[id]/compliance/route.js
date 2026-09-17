import { currentUser } from '@/lib/current-user'
import { can } from '@/lib/schema'
import { confirmCompliance } from '@/lib/approvals'

export const dynamic = 'force-dynamic'

// MARK COMPLIANT. Body: { notes }
export async function POST(req, { params }) {
  const { id } = await params
  const user = await currentUser()
  if (!can(user, 'mark_compliant')) return Response.json({ error: 'Your role cannot confirm compliance' }, { status: 403 })
  const { notes = '' } = await req.json().catch(() => ({}))
  try {
    const plan = await confirmCompliance(id, user, notes)
    return Response.json({ ok: true, cancelledEvents: plan.eventPatches.length })
  } catch (e) {
    if (e.completedSteps) return Response.json({ error: e.message, completedSteps: e.completedSteps, failedStep: e.failedStep }, { status: 500 })
    return Response.json({ error: e.message }, { status: 400 })
  }
}
