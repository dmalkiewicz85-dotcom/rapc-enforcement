import { currentUser } from '@/lib/current-user'
import { can } from '@/lib/schema'
import { updateAppeal } from '@/lib/appeals'

export const dynamic = 'force-dynamic'

// Body: { status: 'UNDER_REVIEW'|'DECIDED', boardDecision }
export async function PATCH(req, { params }) {
  const { id } = await params
  const user = await currentUser()
  if (!can(user, 'approve_enforcement')) return Response.json({ error: 'Not allowed' }, { status: 403 })
  try { return Response.json({ ok: true, ...(await updateAppeal(id, await req.json(), user)) }) }
  catch (e) { return Response.json({ error: e.message }, { status: e.completedSteps ? 500 : 400 }) }
}
