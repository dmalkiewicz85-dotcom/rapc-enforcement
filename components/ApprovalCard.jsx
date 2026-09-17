'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ordinal, money } from '@/lib/format'
import { formatDate } from '@/lib/time'

// One pending enforcement event on the Board Approvals screen.
// Modes: approve as recommended; edit deadline; modify fine; override the
// enforcement step; reject. Anything other than plain approval needs a reason.
export default function ApprovalCard({ item, canApproveFines }) {
  const router = useRouter()
  const { event, violation, rule, property, steps, isFine } = item
  const [mode, setMode] = useState(null) // 'deadline' | 'fine' | 'override' | 'reject'
  const [deadline, setDeadline] = useState(violation.actual_deadline || '')
  const [fineAmount, setFineAmount] = useState(String(event.fine_amount ?? ''))
  const [stepNumber, setStepNumber] = useState(String(event.step_number))
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(null)

  const fineBlocked = isFine && !canApproveFines

  async function send(body) {
    setBusy(true); setError(null)
    try {
      const res = await fetch(`/api/events/${event.id}/decide`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.completedSteps ? `${json.error} (completed: ${json.completedSteps.join(', ')})` : json.error)
      setDone(json)
      router.refresh()
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  function submit() {
    if (mode === 'reject') return send({ action: 'REJECT', reason })
    const body = { action: 'APPROVE', reason }
    if (mode === 'deadline') body.deadline = deadline
    if (mode === 'fine') body.fineAmount = fineAmount
    if (mode === 'override') { body.stepNumber = Number(stepNumber); if (deadline) body.deadline = deadline }
    return send(body)
  }

  if (done) {
    return (
      <li className="px-5 py-3 text-sm text-ink-600">
        <span className="font-semibold">{property?.property_address}</span> — {rule?.name}:{' '}
        {done.status === 'REJECTED' ? 'rejected' : `approved${done.fine ? ` · ${money(done.fine.amount)} fine recorded` : ''}`}
        {done.notice === 'NOTICE_PENDING_GENERATION' && ' · notice will be generated once the letter engine is live'}
        {' · '}<Link href={`/violations/${violation.id}`} className="underline">open case</Link>
      </li>
    )
  }

  return (
    <li className="px-5 py-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-semibold">{property?.property_address ?? violation.property_id}</div>
          <div className="text-sm text-ink-600">
            {rule?.name ?? violation.rule_id} — <span className="font-semibold">{ordinal(Number(event.step_number))} Offense</span>
            {' · '}{event.action_name}
            {isFine && <> · <span className="font-semibold">{money(event.fine_amount)} fine</span></>}
          </div>
          <div className="text-sm text-ink-600">
            Observed {formatDate(violation.date_observed)} · Deadline {violation.actual_deadline ? formatDate(violation.actual_deadline) : <span className="text-red-700">none</span>}
            {' · '}Owner: {violation.owner_name_snapshot}
          </div>
          <div className="text-xs text-ink-500 mt-1">Case {violation.case_number} · <Link href={`/violations/${violation.id}`} className="underline">details</Link></div>
        </div>
        {isFine && (
          <span className="rounded bg-amber-100 px-2 py-1 text-xs font-semibold uppercase text-amber-900">Board approval required</span>
        )}
      </div>

      {fineBlocked && <p className="text-sm text-red-700">Your role cannot approve fines.</p>}

      {!mode ? (
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" disabled={busy || fineBlocked} onClick={() => send({ action: 'APPROVE' })}>
            {busy ? 'Working…' : isFine ? 'Approve fine' : 'Approve & generate notice'}
          </button>
          <button className="btn-secondary" disabled={busy} onClick={() => setMode('deadline')}>Edit deadline</button>
          {isFine && <button className="btn-secondary" disabled={busy || fineBlocked} onClick={() => setMode('fine')}>Modify fine</button>}
          <button className="btn-secondary" disabled={busy} onClick={() => setMode('override')}>Override enforcement</button>
          <button className="btn-secondary" disabled={busy} onClick={() => setMode('reject')}>Reject / return</button>
        </div>
      ) : (
        <div className="rounded-md border border-ink-200 bg-ink-50 p-3 space-y-3">
          {mode === 'deadline' && (
            <label className="block">
              <span className="label">New compliance deadline</span>
              <input type="date" className="input sm:w-56" value={deadline} onChange={e => setDeadline(e.target.value)} />
            </label>
          )}
          {mode === 'fine' && (
            <label className="block">
              <span className="label">Fine amount (recommended {money(event.fine_amount)})</span>
              <input type="number" min="0" step="1" className="input sm:w-40" value={fineAmount} onChange={e => setFineAmount(e.target.value)} />
            </label>
          )}
          {mode === 'override' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="label">Enforcement step (from the configured rule)</span>
                <select className="input" value={stepNumber} onChange={e => setStepNumber(e.target.value)}>
                  {steps.map(s => (
                    <option key={s.id} value={s.step_number}>
                      {ordinal(Number(s.step_number))} — {s.action_name}{Number(s.fine_amount) > 0 ? ` (${money(s.fine_amount)})` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="label">Deadline (blank = recompute from the step)</span>
                <input type="date" className="input" value={deadline} onChange={e => setDeadline(e.target.value)} />
              </label>
            </div>
          )}
          <label className="block">
            <span className="label">Reason * (recorded in the audit log)</span>
            <input className="input" value={reason} onChange={e => setReason(e.target.value)} />
          </label>
          <div className="flex gap-2">
            <button className="btn-primary" disabled={busy || !reason.trim()} onClick={submit}>
              {busy ? 'Working…' : mode === 'reject' ? 'Reject' : 'Approve with changes'}
            </button>
            <button className="btn-secondary" disabled={busy} onClick={() => { setMode(null); setReason('') }}>Cancel</button>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-700">{error}</p>}
    </li>
  )
}
