import { currentUser } from '@/lib/current-user'
import { can } from '@/lib/schema'
import { runRecurringFines } from '@/lib/recurring'

export const dynamic = 'force-dynamic'

// Schedules any recurring fines that have come due, as PENDING events.
// Also runs automatically when the dashboard loads.
export async function POST() {
  const user = await currentUser()
  if (!can(user, 'approve_enforcement')) return Response.json({ error: 'Not allowed' }, { status: 403 })
  try {
    return Response.json({ ok: true, ...(await runRecurringFines(user)) })
  } catch (e) {
    return Response.json({ error: e.message, completedSteps: e.completedSteps ?? [] }, { status: 500 })
  }
}
