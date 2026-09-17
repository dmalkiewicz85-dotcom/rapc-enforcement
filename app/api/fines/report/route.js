import { currentUser } from '@/lib/current-user'
import { can } from '@/lib/schema'
import { loadFines, reportable, buildPmReportRows, pmReportXlsx, pmReportCsv } from '@/lib/fines'
import { todayISO } from '@/lib/time'

export const dynamic = 'force-dynamic'

// ?format=xlsx|csv — the fines pending PM that are ticked for the report.
export async function GET(req) {
  const user = await currentUser()
  if (!can(user, 'pm_reports') && !can(user, 'view_pm')) return Response.json({ error: 'Not allowed' }, { status: 403 })
  const format = new URL(req.url).searchParams.get('format') === 'csv' ? 'csv' : 'xlsx'
  const rows = buildPmReportRows(reportable(await loadFines()))
  const name = `RAPC-PM-Fine-Report-${todayISO()}.${format}`
  const body = format === 'csv' ? pmReportCsv(rows) : pmReportXlsx(rows)
  return new Response(body, {
    headers: {
      'Content-Type': format === 'csv' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${name}"`,
    },
  })
}
