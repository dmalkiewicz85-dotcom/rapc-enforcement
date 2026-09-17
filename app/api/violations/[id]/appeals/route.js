import { currentUser } from '@/lib/current-user'
import { can } from '@/lib/schema'
import { recordAppeal } from '@/lib/appeals'

export const dynamic = 'force-dynamic'

// Body: { appealDate, description }
export async function POST(req, { params }) {
  const { id } = await params
  const user = await currentUser()
  if (!can(user, 'review')) return Response.json({ error: 'Not allowed' }, { status: 403 })
  try { return Response.json({ ok: true, appeal: await recordAppeal(id, await req.json(), user) }) }
  catch (e) { return Response.json({ error: e.message }, { status: e.completedSteps ? 500 : 400 }) }
}
