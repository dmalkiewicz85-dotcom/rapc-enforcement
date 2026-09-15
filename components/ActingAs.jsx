'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { UserCircle } from 'lucide-react'

const ROLE_LABEL = {
  BOARD_ADMIN: 'Board Administrator',
  BOARD_MEMBER: 'Board Member',
  ARC_MEMBER: 'ARC Member',
  PROPERTY_MANAGEMENT: 'Property Management',
}

// Pre-go-live stand-in for sign-in. Picks a row from the USERS tab.
export default function ActingAs({ user, users }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function change(e) {
    setBusy(true)
    await fetch('/api/acting-as', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: e.target.value }),
    })
    setBusy(false)
    router.refresh()
  }

  if (!users.length) {
    return <span className="text-xs text-ink-400">No users loaded</span>
  }

  return (
    <label className="flex items-center gap-2 text-sm">
      <UserCircle size={18} className="text-ink-400" />
      <span className="hidden sm:inline text-ink-500">Acting as</span>
      <select className="input w-auto py-1" value={user?.id ?? ''} onChange={change} disabled={busy}>
        <option value="" disabled>Select user…</option>
        {users.map(u => (
          <option key={u.id} value={u.id}>{u.name} — {ROLE_LABEL[u.role] ?? u.role}</option>
        ))}
      </select>
    </label>
  )
}
