import { currentUser } from '@/lib/current-user'
import { can } from '@/lib/schema'
import { updateSetting } from '@/lib/admin'

export const dynamic = 'force-dynamic'

// Body: { key, value }
export async function PATCH(req) {
  const user = await currentUser()
  if (!can(user, 'manage_settings')) return Response.json({ error: 'Not allowed' }, { status: 403 })
  const { key, value } = await req.json()
  if (!key) return Response.json({ error: 'key is required' }, { status: 400 })
  try { return Response.json({ ok: true, ...(await updateSetting(key, value, user)) }) }
  catch (e) { return Response.json({ error: e.message }, { status: e.completedSteps ? 500 : 400 }) }
}
