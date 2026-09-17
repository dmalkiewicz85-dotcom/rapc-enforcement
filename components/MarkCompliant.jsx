'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2 } from 'lucide-react'

// MARK COMPLIANT: closes the case, resets the count, cancels pending events.
export default function MarkCompliant({ violationId, pendingCount }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function confirm() {
    setBusy(true); setError(null)
    try {
      const res = await fetch(`/api/violations/${violationId}/compliance`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notes }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setOpen(false)
      router.refresh()
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  if (!open) {
    return <button className="btn-primary" onClick={() => setOpen(true)}><CheckCircle2 size={16} /> Mark compliant</button>
  }
  return (
    <div className="card w-full space-y-3 border-green-200">
      <div className="font-semibold">Confirm compliance</div>
      <p className="text-sm text-ink-600">
        The case closes today, the offense count resets for this owner
        {pendingCount > 0 && `, and ${pendingCount} pending enforcement event${pendingCount === 1 ? '' : 's'} will be cancelled`}.
        Nothing is deleted.
      </p>
      <label className="block">
        <span className="label">Compliance notes (optional)</span>
        <input className="input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Verified on drive-by 9/22" />
      </label>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="flex gap-2">
        <button className="btn-primary" disabled={busy} onClick={confirm}>{busy ? 'Saving…' : 'Confirm — close case'}</button>
        <button className="btn-secondary" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  )
}
