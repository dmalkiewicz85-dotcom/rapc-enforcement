'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, AlertTriangle } from 'lucide-react'
import { ordinal, money } from '@/lib/format'
import { formatDate } from '@/lib/time'

// NEW VIOLATION WORKFLOW (spec): Step 1 property → Step 2 violation type →
// Step 3 details → Enforcement Determination → submit for Board approval.
// The offense level is never chosen here; the server computes it.
export default function NewViolationForm({ properties, rules, today, initialPropertyId = '' }) {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [propertyId, setPropertyId] = useState(initialPropertyId)
  const [ruleId, setRuleId] = useState('')
  const [dateObserved, setDateObserved] = useState(today)
  const [description, setDescription] = useState('')
  const [internalNotes, setInternalNotes] = useState('')
  const [deadlineOverride, setDeadlineOverride] = useState('')
  const [overrideReason, setOverrideReason] = useState('')
  const [det, setDet] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const property = properties.find(p => p.id === propertyId) ?? null
  const matches = useMemo(() => {
    const n = q.trim().toLowerCase()
    if (!n) return []
    return properties.filter(p => p.address.toLowerCase().includes(n) || (p.ownerName ?? '').toLowerCase().includes(n)).slice(0, 8)
  }, [q, properties])

  const d = det?.determination
  const needsOverride = d && !d.defaultDeadline
  const overrideActive = deadlineOverride && deadlineOverride !== d?.defaultDeadline
  const canSubmit = d && description.trim() && (!needsOverride || deadlineOverride) && (!overrideActive || overrideReason.trim())

  async function determine() {
    setBusy(true); setError(null); setDet(null)
    try {
      const res = await fetch('/api/violations/determine', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ propertyId, ruleId, dateObserved }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setDet(json)
      setDeadlineOverride(json.determination.defaultDeadline ?? '')
      setOverrideReason('')
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  async function submit() {
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/violations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ propertyId, ruleId, dateObserved, description, internalNotes, deadlineOverride, overrideReason }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.completedSteps ? `${json.error} (completed: ${json.completedSteps.join(', ')})` : json.error)
      router.push(`/violations/${json.id}`)
    } catch (e) { setError(e.message); setBusy(false) }
  }

  // Any change to the inputs invalidates the determination shown.
  const reset = fn => (...a) => { fn(...a); setDet(null) }

  return (
    <div className="space-y-6">
      <section className="card space-y-3">
        <h2 className="label">Step 1 — Property</h2>
        {property ? (
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-lg font-semibold">{property.address}</div>
              <div className="text-sm text-ink-600">
                Owner: {property.ownerName || <span className="text-red-700">no current owner</span>}
                {property.ownerEmail && <> · {property.ownerEmail}</>}
              </div>
              {property.mailing && <div className="text-sm text-ink-600">Mailing: {property.mailing}</div>}
            </div>
            <button className="btn-secondary" onClick={reset(() => { setPropertyId(''); setQ('') })}>Change</button>
          </div>
        ) : (
          <div className="relative">
            <div className="flex items-center gap-2">
              <Search size={16} className="text-ink-400" />
              <input autoFocus className="input" placeholder="Start typing an address or owner…" value={q} onChange={e => setQ(e.target.value)} />
            </div>
            {matches.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full rounded-md border border-ink-200 bg-white shadow">
                {matches.map(p => (
                  <li key={p.id}>
                    <button type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-ink-100" onClick={() => { setPropertyId(p.id); setQ('') }}>
                      <span className="font-medium">{p.address}</span>
                      <span className="text-ink-500"> — {p.ownerName || 'no current owner'}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {q.trim() && matches.length === 0 && <p className="mt-1 text-sm text-ink-500">No properties match.</p>}
          </div>
        )}
      </section>

      <section className="card space-y-3">
        <h2 className="label">Step 2 — Violation type</h2>
        <select className="input" value={ruleId} onChange={reset(e => setRuleId(e.target.value))}>
          <option value="">Select…</option>
          {rules.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </section>

      <section className="card space-y-3">
        <h2 className="label">Step 3 — Details</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="label">Date observed *</span>
            <input type="date" className="input" max={today} value={dateObserved} onChange={reset(e => setDateObserved(e.target.value))} />
          </label>
        </div>
        <label className="block">
          <span className="label">Violation description *</span>
          <textarea className="input" rows={3} value={description} onChange={e => setDescription(e.target.value)}
            placeholder="What was observed. This appears in the notice to the owner." />
        </label>
        <label className="block">
          <span className="label">Internal notes (never sent to the owner)</span>
          <textarea className="input" rows={2} value={internalNotes} onChange={e => setInternalNotes(e.target.value)} />
        </label>
        <p className="text-xs text-ink-500">Evidence uploads arrive with the Drive integration (Phase 7).</p>
        <button className="btn-primary" disabled={!propertyId || !ruleId || !dateObserved || busy} onClick={determine}>
          {busy && !det ? 'Determining…' : 'Determine enforcement'}
        </button>
      </section>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>
      )}

      {det && (
        <section className="card space-y-4 border-brand-300">
          <h2 className="text-lg font-semibold">Enforcement Determination</h2>
          {det.openCase && (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <div>
                Case <span className="font-semibold">{det.openCase.caseNumber}</span> (observed {formatDate(det.openCase.dateObserved)}) is still open
                for this rule and owner. This observation will progress that case rather than open a new one.
              </div>
            </div>
          )}
          <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
            <Row k="Property" v={det.property.address} />
            <Row k="Owner" v={det.owner.name} />
            <Row k="Violation" v={det.rule.name} />
            <Row k="Determined enforcement level" v={<span className="font-semibold">{ordinal(d.offenseNumber)} Offense</span>} />
            <Row k="Recommended action" v={<>{d.actionName}{d.isFinalWarning && ' (final warning)'}{d.manualActionRequired && ' — manual Board action'}</>} />
            <Row k="Fine" v={<span className={d.fineAmount > 0 ? 'font-semibold' : ''}>{money(d.fineAmount)}{d.isRecurring && d.recurrenceDays ? ` every ${d.recurrenceDays} days until compliance` : d.isRecurring ? ' per occurrence' : ''}</span>} />
            <Row k="Default deadline" v={d.defaultDeadline ? formatDate(d.defaultDeadline) : <span className="text-red-700">Not configured — enter one below</span>} />
            <Row k="Approval" v={d.requiresBoardApproval ? 'Board approval required before anything is sent' : 'No approval configured'} />
            <Row k="Basis" v={<span className="text-ink-600">{d.basis}</span>} />
          </dl>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="label">Compliance deadline {needsOverride && '*'}</span>
              <input type="date" className="input" min={dateObserved} value={deadlineOverride} onChange={e => setDeadlineOverride(e.target.value)} />
            </label>
            {(overrideActive || needsOverride) && (
              <label className="block">
                <span className="label">Reason for {needsOverride ? 'this deadline' : 'override'} *</span>
                <input className="input" value={overrideReason} onChange={e => setOverrideReason(e.target.value)} />
              </label>
            )}
          </div>

          <div className="flex flex-wrap gap-3">
            <button className="btn-primary" disabled={!canSubmit || busy} onClick={submit}>
              {busy ? 'Submitting…' : 'Submit for Board approval'}
            </button>
            <button className="btn-secondary" disabled={busy} onClick={() => setDet(null)}>Back</button>
          </div>
        </section>
      )}
    </div>
  )
}

function Row({ k, v }) {
  return (<><dt className="text-ink-500">{k}</dt><dd>{v}</dd></>)
}
