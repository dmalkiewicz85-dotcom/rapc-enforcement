import { currentUser } from '@/lib/current-user'
import { can } from '@/lib/schema'
import { saveUser } from '@/lib/admin'

export const dynamic = 'force-dynamic'

// Body: { id?, name, email, role, active } — with id updates, without creates.
export async function POST(req) {
  const user = await currentUser()
  if (!can(user, 'manage_users')) return Response.json({ error: 'Not allowed' }, { status: 403 })
  try { return Response.json({ ok: true, user: await saveUser(await req.json(), user) }) }
  catch (e) { return Response.json({ error: e.message }, { status: e.completedSteps ? 500 : 400 }) }
}
