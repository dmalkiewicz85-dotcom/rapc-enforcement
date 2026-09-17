import Link from 'next/link'
import { googleConfigStatus } from '@/lib/google'
import { loadViolations } from '@/lib/violations'
import { readTab } from '@/lib/sheets'
import { formatDate } from '@/lib/time'
import { ordinal, money } from '@/lib/format'

export const dynamic = 'force-dynamic'

const STATUS_LABEL = v => {
  if (v.status === 'CLOSED') return v.compliance_status === 'COMPLIANT' ? 'Closed · Compliant' : 'Closed'
  if (v.pendingEvent) return 'Awaiting Board approval'
  return v.overdueDays > 0 ? `Overdue ${v.overdueDays}d` : 'Open'
}

export default async function Page({ searchParams }) {
  const sp = await searchParams
  const filters = { status: sp.status ?? '', ruleId: sp.rule ?? '', q: sp.q ?? '', overdue: sp.overdue === '1', offense: sp.offense ?? '', appeals: sp.appeals === '1' }
  const { configured } = googleConfigStatus()
  if (!configured) return <p className="text-sm text-ink-500">Google connection not configured.</p>

  let list, rules, error
  try {
    ;[list, rules] = await Promise.all([loadViolations(filters), readTab('VIOLATION_RULES')])
  } catch (e) { error = e.message }
  if (error) return <p className="text-sm font-mono text-red-800">{error}</p>

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Violations</h1>
        <Link href="/violations/new" className="btn-primary">New Violation</Link>
      </div>

      <form className="card grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <input name="q" defaultValue={filters.q} placeholder="Address, owner, or case #" className="input" />
        <select name="status" defaultValue={filters.status} className="input">
          <option value="">Any status</option>
          <option value="OPEN">Open</option>
          <option value="CLOSED">Closed</option>
        </select>
        <select name="rule" defaultValue={filters.ruleId} className="input">
          <option value="">Any violation type</option>
          {rules.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <select name="offense" defaultValue={filters.offense} className="input">
          <option value="">Any offense</option>
          {[1, 2, 3, 4].map(n => <option key={n} value={n}>{ordinal(n)}{n === 4 ? '+' : ''} offense</option>)}
        </select>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1 text-sm"><input type="checkbox" name="overdue" value="1" defaultChecked={filters.overdue} /> Overdue</label>
          <button className="btn-secondary py-1">Filter</button>
        </div>
      </form>

      {list.length === 0 ? (
        <p className="text-sm text-ink-500">No violations match.</p>
      ) : (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-ink-100 text-left text-xs uppercase text-ink-500">
              <tr>
                <th className="px-4 py-2">Case</th>
                <th className="px-4 py-2">Property</th>
                <th className="px-4 py-2">Violation</th>
                <th className="px-4 py-2">Observed</th>
                <th className="px-4 py-2">Offense</th>
                <th className="px-4 py-2">Deadline</th>
                <th className="px-4 py-2">Fine</th>
                <th className="px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-200">
              {list.map(v => (
                <tr key={v.id} className={v.status === 'CLOSED' ? 'text-ink-500' : ''}>
                  <td className="px-4 py-2 font-medium"><Link href={`/violations/${v.id}`} className="hover:underline">{v.case_number}</Link></td>
                  <td className="px-4 py-2">{v.property?.property_address ?? v.property_id}<div className="text-xs text-ink-500">{v.owner_name_snapshot}</div></td>
                  <td className="px-4 py-2">{v.rule?.name ?? v.rule_id}</td>
                  <td className="px-4 py-2">{formatDate(v.date_observed)}</td>
                  <td className="px-4 py-2">{ordinal(Number(v.offense_number))}</td>
                  <td className={`px-4 py-2 ${v.overdueDays > 0 ? 'text-red-700 font-semibold' : ''}`}>{formatDate(v.deadline)}</td>
                  <td className="px-4 py-2">{v.pendingEvent && Number(v.pendingEvent.fine_amount) > 0 ? money(v.pendingEvent.fine_amount) : ''}</td>
                  <td className="px-4 py-2">{STATUS_LABEL(v)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-ink-500">{list.length} case{list.length === 1 ? '' : 's'}</p>
    </div>
  )
}
