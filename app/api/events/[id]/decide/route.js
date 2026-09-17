import { currentUser } from '@/lib/current-user'
import { readSettings } from '@/lib/sheets'
import { can } from '@/lib/schema'
import { decideEvent } from '@/lib/approvals'

export const dynamic = 'force-dynamic'

// Board decision on a pending enforcement event. Body:
// { action: 'APPROVE'|'REJECT', reason, fineAmount?, deadline?, stepNumber? }
export async function POST(req, { params }) {
  const { id } = await params
  const user = await currentUser()
  if (!can(user, 'approve_enforcement')) return Response.json({ error: 'Your role cannot approve enforcement' }, { status: 403 })
  const body = await req.json()
  try {
    const settings = await readSettings()
    const result = await decideEvent(id, body, user, settings)
    return Response.json({
      ok: true, status: result.eventPatch.status, overrides: result.overrides,
      fine: result.fine ? { id: result.fine.id, amount: result.fine.amount } : null,
      closesCase: result.closesCase, notice: result.notice?.status ?? null,
    })
  } catch (e) {
    if (e.completedSteps) return Response.json({ error: e.message, completedSteps: e.completedSteps, failedStep: e.failedStep }, { status: 500 })
    return Response.json({ error: e.message }, { status: 400 })
  }
}
