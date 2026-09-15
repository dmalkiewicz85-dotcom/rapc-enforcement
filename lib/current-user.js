// Who is acting. Until go-live there is no login: the user picks themselves
// from the USERS tab and the choice lives in a cookie. Every permission check
// and audit entry still runs against that user, so the workflow is exercised
// exactly as it will be once Google sign-in replaces the picker (docs/TODO.md #7).

import { cookies } from 'next/headers'
import { readTab } from './sheets.js'
import { googleConfigStatus } from './google.js'

export const ACTING_AS_COOKIE = 'rapc_acting_as'

export async function listUsers() {
  if (!googleConfigStatus().configured) return []
  return (await readTab('USERS')).filter(u => u.active === 'Y')
}

export async function currentUser() {
  const id = (await cookies()).get(ACTING_AS_COOKIE)?.value
  if (!id) return null
  const users = await listUsers()
  return users.find(u => u.id === id) ?? null
}
