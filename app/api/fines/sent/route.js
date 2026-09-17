import { currentUser } from '@/lib/current-user'
import { can } from '@/lib/schema'
import { markSentToPm } from '@/lib/fines'

export const dynamic = 'force-dynamic'

// Body: { fineIds: [] } — records the report as sent to Property Management.
export async function POST(req) {
  const user = await currentUser()
  if (!can(user, 'pm_reports')) return Response.json({ error: 'Not allowed' }, { status: 403 })
  const { fineIds = [] } = await req.json()
  try {
    return Response.json({ ok: true, ...(await markSentToPm(fineIds, user)) })
  } catch (e) {
    return Response.json({ error: e.message, completedSteps: e.completedSteps ?? [] }, { status: e.completedSteps ? 500 : 400 })
  }
}
