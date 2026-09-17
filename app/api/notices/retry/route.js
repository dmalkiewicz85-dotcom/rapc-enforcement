import { currentUser } from '@/lib/current-user'
import { can } from '@/lib/schema'
import { retryNotice } from '@/lib/notices'

export const dynamic = 'force-dynamic'

// Body: { eventId } — re-send a failed/manual notice from the filed PDF, or
// generate it if approval was interrupted before the NOTICES row existed.
export async function POST(req) {
  const user = await currentUser()
  if (!can(user, 'approve_enforcement')) return Response.json({ error: 'Not allowed' }, { status: 403 })
  const { eventId } = await req.json()
  try { return Response.json({ ok: true, ...(await retryNotice(eventId, user)) }) }
  catch (e) { return Response.json({ error: e.message, completedSteps: e.completedSteps ?? [] }, { status: e.completedSteps ? 500 : 400 }) }
}
