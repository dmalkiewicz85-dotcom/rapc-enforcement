import { googleConfigStatus } from '@/lib/google'
import { currentUser } from '@/lib/current-user'
import { can } from '@/lib/schema'
import { readTabs } from '@/lib/sheets'
import { currentOwnership } from '@/lib/violations'
import { todayISO } from '@/lib/time'
import NewViolationForm from '@/components/NewViolationForm'

export const dynamic = 'force-dynamic'

export default async function Page({ searchParams }) {
  const { property = '' } = await searchParams
  const { configured } = googleConfigStatus()
  if (!configured) return <p className="text-sm text-ink-500">Google connection not configured.</p>
  const user = await currentUser()
  if (!user) return <p className="text-sm text-ink-500">Select who you are acting as (top right) to continue.</p>
  if (!can(user, 'submit')) return <p className="text-sm text-ink-500">Your role cannot submit violations.</p>

  const data = await readTabs('PROPERTIES', 'OWNERS', 'PROPERTY_OWNERSHIP', 'VIOLATION_RULES')
  const properties = data.PROPERTIES
    .filter(p => p.active === 'Y')
    .map(p => {
      const { owner } = currentOwnership(data, p.id)
      return {
        id: p.id, address: p.property_address,
        ownerName: owner?.name ?? '', ownerEmail: owner?.email ?? '',
        mailing: owner ? [owner.mailing_address, [owner.mailing_city, owner.mailing_state, owner.mailing_zip].filter(Boolean).join(' ')].filter(Boolean).join(', ') : '',
      }
    })
    .sort((a, b) => a.address.localeCompare(b.address, 'en', { numeric: true }))
  const rules = data.VIOLATION_RULES.filter(r => r.active === 'Y').map(r => ({ id: r.id, name: r.name }))

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">New Violation</h1>
      <NewViolationForm properties={properties} rules={rules} today={todayISO()} initialPropertyId={property} />
    </div>
  )
}
