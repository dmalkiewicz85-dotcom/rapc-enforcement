import { cookies } from 'next/headers'
import { ACTING_AS_COOKIE, listUsers } from '@/lib/current-user'

export const dynamic = 'force-dynamic'

// Pre-go-live user picker. Replaced by Google sign-in at launch.
export async function POST(req) {
  const { userId } = await req.json()
  const users = await listUsers()
  if (!users.some(u => u.id === userId)) {
    return Response.json({ error: 'Unknown user' }, { status: 400 })
  }
  ;(await cookies()).set(ACTING_AS_COOKIE, userId, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30 })
  return Response.json({ ok: true })
}
