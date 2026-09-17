import { googleConfigStatus } from '@/lib/google'
import { currentUser } from '@/lib/current-user'
import { can } from '@/lib/schema'
import { loadFines } from '@/lib/fines'
import FinesQueue from '@/components/FinesQueue'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const { configured } = googleConfigStatus()
  if (!configured) return <p className="text-sm text-ink-500">Google connection not configured.</p>
  const user = await currentUser()
  if (!user) return <p className="text-sm text-ink-500">Select who you are acting as (top right) to continue.</p>
  if (!can(user, 'pm_reports') && !can(user, 'view_pm')) return <p className="text-sm text-ink-500">Your role cannot view fines.</p>

  let fines, error
  try { fines = await loadFines() } catch (e) { error = e.message }
  if (error) return <p className="text-sm font-mono text-red-800">{error}</p>

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Fines / Property Management</h1>
      <FinesQueue
        pending={fines.filter(f => f.pendingPm)}
        sent={fines.filter(f => f.status === 'SENT_TO_PM')}
        done={fines.filter(f => ['ASSESSED', 'WAIVED', 'DISPUTED'].includes(f.status))}
        canManage={can(user, 'pm_reports')}
        canUpdateStatus={can(user, 'update_pm_status') || can(user, 'pm_reports')}
      />
    </div>
  )
}
