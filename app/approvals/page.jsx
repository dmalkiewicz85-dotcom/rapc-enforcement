import { googleConfigStatus } from '@/lib/google'
import { currentUser } from '@/lib/current-user'
import { readSettings } from '@/lib/sheets'
import { can } from '@/lib/schema'
import { loadPendingApprovals } from '@/lib/approvals'
import ApprovalCard from '@/components/ApprovalCard'

export const dynamic = 'force-dynamic'

export default async function Page({ searchParams }) {
  const { fines } = await searchParams
  const { configured } = googleConfigStatus()
  if (!configured) return <p className="text-sm text-ink-500">Google connection not configured.</p>
  const user = await currentUser()
  if (!user) return <p className="text-sm text-ink-500">Select who you are acting as (top right) to continue.</p>
  if (!can(user, 'approve_enforcement')) return <p className="text-sm text-ink-500">Your role cannot approve enforcement.</p>

  let pending, settings, error
  try { [pending, settings] = await Promise.all([loadPendingApprovals(), readSettings()]) } catch (e) { error = e.message }
  if (error) return <p className="text-sm font-mono text-red-800">{error}</p>

  const canApproveFines = can(user, 'approve_fines', settings)
  const fineItems = pending.filter(i => i.isFine)
  const enforcementItems = pending.filter(i => !i.isFine)
  const sections = fines === '1'
    ? [['Fines — Board approval required', fineItems]]
    : [['Fines — Board approval required', fineItems], ['Enforcement determinations', enforcementItems]]

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Board Approvals</h1>
      {pending.length === 0 && <p className="text-sm text-ink-500">Nothing is waiting on the Board.</p>}
      {sections.map(([title, items]) => items.length > 0 && (
        <section key={title}>
          <h2 className="text-lg font-semibold mb-3">{title} <span className="text-ink-400 font-normal">({items.length})</span></h2>
          <ul className="card divide-y divide-ink-200 p-0">
            {items.map(item => <ApprovalCard key={item.event.id} item={item} canApproveFines={canApproveFines} />)}
          </ul>
        </section>
      ))}
    </div>
  )
}
