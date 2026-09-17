import { currentUser } from '@/lib/current-user'
import { can } from '@/lib/schema'
import { updateStep } from '@/lib/admin'

export const dynamic = 'force-dynamic'

export async function PATCH(req, { params }) {
  const { id } = await params
  const user = await currentUser()
  if (!can(user, 'manage_rules')) return Response.json({ error: 'Not allowed' }, { status: 403 })
  try { return Response.json({ ok: true, ...(await updateStep(id, await req.json(), user)) }) }
  catch (e) { return Response.json({ error: e.message }, { status: e.completedSteps ? 500 : 400 }) }
}
