import { currentUser } from '@/lib/current-user'
import { can } from '@/lib/schema'
import { setIncludeInReport, updatePmStatus } from '@/lib/fines'

export const dynamic = 'force-dynamic'

// Body: { include: true|false }  or  { status, reference, notes }
export async function PATCH(req, { params }) {
  const { id } = await params
  const user = await currentUser()
  const body = await req.json()
  try {
    if ('include' in body) {
      if (!can(user, 'pm_reports')) return Response.json({ error: 'Not allowed' }, { status: 403 })
      return Response.json({ ok: true, ...(await setIncludeInReport(id, Boolean(body.include), user)) })
    }
    if (!can(user, 'update_pm_status') && !can(user, 'pm_reports')) return Response.json({ error: 'Not allowed' }, { status: 403 })
    return Response.json({ ok: true, ...(await updatePmStatus(id, body, user)) })
  } catch (e) {
    return Response.json({ error: e.message, completedSteps: e.completedSteps ?? [] }, { status: e.completedSteps ? 500 : 400 })
  }
}
