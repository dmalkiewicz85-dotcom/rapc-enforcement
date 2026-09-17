import { currentUser } from '@/lib/current-user'
import { googleConfigStatus } from '@/lib/google'
import { can } from '@/lib/schema'
import RosterImport from '@/components/RosterImport'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const { configured } = googleConfigStatus()
  const user = configured ? await currentUser() : null

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Admin</h1>
      {!configured ? (
        <p className="text-sm text-ink-500">Google connection not configured.</p>
      ) : !user ? (
        <p className="text-sm text-ink-500">Select who you are acting as (top right) to continue.</p>
      ) : !can(user, 'import_roster') ? (
        <p className="text-sm text-ink-500">Only a Board Administrator can import the roster.</p>
      ) : (
        <RosterImport />
      )}
      <p className="text-sm text-ink-500">Phase 3 UI — rules configuration, HOA settings, users — to follow.</p>
    </div>
  )
}
