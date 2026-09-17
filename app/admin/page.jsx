import { currentUser } from '@/lib/current-user'
import { googleConfigStatus } from '@/lib/google'
import { can } from '@/lib/schema'
import { loadAdmin, SETTING_HINTS } from '@/lib/admin'
import RosterImport from '@/components/RosterImport'
import { SettingsEditor, RulesEditor, UsersEditor } from '@/components/AdminConfig'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const { configured } = googleConfigStatus()
  const user = configured ? await currentUser() : null

  if (!configured) return <Shell><p className="text-sm text-ink-500">Google connection not configured.</p></Shell>
  if (!user) return <Shell><p className="text-sm text-ink-500">Select who you are acting as (top right) to continue.</p></Shell>
  const allowed = ['manage_settings', 'manage_rules', 'manage_users', 'import_roster'].some(a => can(user, a))
  if (!allowed) return <Shell><p className="text-sm text-ink-500">Your role has no administrative access.</p></Shell>

  let data, error
  try { data = await loadAdmin() } catch (e) { error = e.message }
  if (error) return <Shell><p className="text-sm font-mono text-red-800">{error}</p></Shell>

  return (
    <Shell>
      {can(user, 'import_roster') && <RosterImport />}
      {can(user, 'manage_settings') && <SettingsEditor settings={data.settings} hints={SETTING_HINTS} missing={data.settingsMissing} />}
      {can(user, 'manage_rules') && <RulesEditor rules={data.rules} />}
      {can(user, 'manage_users') && <UsersEditor users={data.users} me={user.id} />}
    </Shell>
  )
}

function Shell({ children }) {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Admin</h1>
      {children}
    </div>
  )
}
