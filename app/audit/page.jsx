import Link from 'next/link'
import { googleConfigStatus } from '@/lib/google'
import { currentUser } from '@/lib/current-user'
import { can } from '@/lib/schema'
import { readTab } from '@/lib/sheets'
import { formatDateTime } from '@/lib/time'

export const dynamic = 'force-dynamic'

const ENTITY_LINK = { VIOLATION: id => `/violations/${id}`, PROPERTY: id => `/properties/${id}` }

// Audit trail (spec, AUDIT LOG): newest first, text filter, paged.
export default async function Page({ searchParams }) {
  const { q = '', page = '1' } = await searchParams
  const { configured } = googleConfigStatus()
  if (!configured) return <p className="text-sm text-ink-500">Google connection not configured.</p>
  const user = await currentUser()
  if (!can(user, 'view_history')) return <p className="text-sm text-ink-500">Your role cannot view the audit log.</p>

  const needle = q.trim().toLowerCase()
  const all = (await readTab('AUDIT_LOG'))
    .filter(a => !needle || [a.action, a.user_name, a.entity_type, a.entity_id, a.reason, a.new_value, a.old_value].some(x => String(x).toLowerCase().includes(needle)))
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
  const size = 100
  const p = Math.max(1, Number(page) || 1)
  const rows = all.slice((p - 1) * size, p * size)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Audit log</h1>
        <form className="flex gap-2"><input name="q" defaultValue={q} placeholder="Search…" className="input w-64" /><button className="btn-secondary">Search</button></form>
      </div>
      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-ink-100 text-left text-xs uppercase text-ink-500">
            <tr><th className="px-4 py-2">When</th><th className="px-4 py-2">Who</th><th className="px-4 py-2">Action</th><th className="px-4 py-2">Entity</th><th className="px-4 py-2">Detail</th></tr>
          </thead>
          <tbody className="divide-y divide-ink-200">
            {rows.map(a => (
              <tr key={a.id}>
                <td className="px-4 py-2 whitespace-nowrap text-ink-600">{formatDateTime(a.created_at)}</td>
                <td className="px-4 py-2">{a.user_name}</td>
                <td className="px-4 py-2 font-medium">{a.action.replace(/_/g, ' ')}</td>
                <td className="px-4 py-2 font-mono text-xs">
                  {ENTITY_LINK[a.entity_type]
                    ? <Link href={ENTITY_LINK[a.entity_type](a.entity_id)} className="underline">{a.entity_type} {a.entity_id}</Link>
                    : `${a.entity_type} ${a.entity_id}`}
                </td>
                <td className="px-4 py-2 text-xs text-ink-600 max-w-xl">
                  {a.reason && <div>{a.reason}</div>}
                  {a.new_value && <div className="font-mono break-all">{a.new_value}</div>}
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} className="px-4 py-3 text-ink-500">No entries.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-xs text-ink-500">
        <span>{all.length} entries</span>
        <span className="flex gap-3">
          {p > 1 && <Link href={`/audit?q=${encodeURIComponent(q)}&page=${p - 1}`} className="underline">Newer</Link>}
          {p * size < all.length && <Link href={`/audit?q=${encodeURIComponent(q)}&page=${p + 1}`} className="underline">Older</Link>}
        </span>
      </div>
    </div>
  )
}
