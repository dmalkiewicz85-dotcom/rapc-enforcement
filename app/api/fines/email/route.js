import { currentUser } from '@/lib/current-user'
import { can } from '@/lib/schema'
import { emailPmReport } from '@/lib/fines'

export const dynamic = 'force-dynamic'

export async function POST() {
  const user = await currentUser()
  if (!can(user, 'pm_reports')) return Response.json({ error: 'Not allowed' }, { status: 403 })
  try { return Response.json({ ok: true, ...(await emailPmReport(user)) }) }
  catch (e) { return Response.json({ error: e.message, completedSteps: e.completedSteps ?? [] }, { status: e.completedSteps ? 500 : 400 }) }
}
