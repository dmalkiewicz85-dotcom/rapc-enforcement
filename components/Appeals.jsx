'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatDate } from '@/lib/time'

export default function Appeals({ violationId, appeals, canRecord, canDecide, today }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState(today)
  const [desc, setDesc] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function call(url, method, body) {
    setBusy(true); setError(null)
    try {
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setOpen(false); setDesc('')
      router.refresh()
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  return (
    <section className="card space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="label mb-0">Appeals</h2>
        {canRecord && !open && <button className="btn-secondary py-1 text-xs" onClick={() => setOpen(true)}>Record appeal</button>}
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      {open && (
        <div className="grid gap-2 sm:grid-cols-[auto_1fr_auto] sm:items-end">
          <label><span className="label">Received</span><input type="date" className="input" max={today} value={date} onChange={e => setDate(e.target.value)} /></label>
          <label><span className="label">What the owner is appealing *</span><input className="input" value={desc} onChange={e => setDesc(e.target.value)} /></label>
          <div className="flex gap-2">
            <button className="btn-primary py-2" disabled={busy || !desc.trim()} onClick={() => call(`/api/violations/${violationId}/appeals`, 'POST', { appealDate: date, description: desc })}>Save</button>
            <button className="btn-secondary py-2" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </div>
      )}
      {appeals.length === 0 ? <p className="text-sm text-ink-500">None recorded.</p> : (
        <ul className="divide-y divide-ink-200 text-sm">
          {appeals.map(a => <AppealRow key={a.id} a={a} canDecide={canDecide} busy={busy} onSave={body => call(`/api/appeals/${a.id}`, 'PATCH', body)} />)}
        </ul>
      )}
    </section>
  )
}

function AppealRow({ a, canDecide, busy, onSave }) {
  const [decision, setDecision] = useState(a.board_decision || '')
  return (
    <li className="py-2 space-y-1">
      <div><span className="font-semibold">{formatDate(a.appeal_date)}</span> · {a.status.replace(/_/g, ' ')} — {a.description}</div>
      {a.status === 'DECIDED' ? (
        <div className="text-ink-600">Board decision {formatDate(a.decision_date)}: {a.board_decision}</div>
      ) : canDecide && (
        <div className="flex flex-wrap gap-2">
          <input className="input py-1 sm:w-96" placeholder="Board decision" value={decision} onChange={e => setDecision(e.target.value)} />
          <button className="btn-primary py-1 text-xs" disabled={busy || !decision.trim()} onClick={() => onSave({ status: 'DECIDED', boardDecision: decision })}>Record decision</button>
          {a.status === 'RECEIVED' && <button className="btn-secondary py-1 text-xs" disabled={busy} onClick={() => onSave({ status: 'UNDER_REVIEW' })}>Mark under review</button>}
        </div>
      )}
    </li>
  )
}
