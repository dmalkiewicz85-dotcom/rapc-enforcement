'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// Retry delivery of a failed / manual notice, or generate one that approval
// did not manage to file. Board approvers only.
export default function NoticeActions({ eventId, label = 'Retry delivery' }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  async function retry() {
    setBusy(true); setMsg(null)
    try {
      const res = await fetch('/api/notices/retry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ eventId }) })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setMsg(json.status.replace(/_/g, ' '))
      router.refresh()
    } catch (e) { setMsg(e.message) } finally { setBusy(false) }
  }
  return (
    <span className="inline-flex items-center gap-2">
      <button className="btn-secondary py-1 text-xs" disabled={busy} onClick={retry}>{busy ? '…' : label}</button>
      {msg && <span className="text-xs text-ink-600">{msg}</span>}
    </span>
  )
}
