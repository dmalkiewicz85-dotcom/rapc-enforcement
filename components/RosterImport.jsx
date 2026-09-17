'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, AlertTriangle, CheckCircle2 } from 'lucide-react'

// IMPORT PROPERTY ROSTER (spec): upload → preview → explicit confirm.
// The same file is posted twice; the server recomputes the plan on apply.
export default function RosterImport() {
  const router = useRouter()
  const fileRef = useRef(null)
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [deactivateMissing, setDeactivateMissing] = useState(false)

  async function post(mode) {
    setBusy(true); setError(null)
    const fd = new FormData()
    fd.append('file', file)
    fd.append('mode', mode)
    if (deactivateMissing) fd.append('deactivateMissing', '1')
    try {
      const res = await fetch('/api/roster', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) { setError(json); return }
      if (mode === 'preview') setPreview(json)
      else { setResult(json); setPreview(null); router.refresh() }
    } catch (e) {
      setError({ error: e.message })
    } finally {
      setBusy(false)
    }
  }

  function reset() {
    setFile(null); setPreview(null); setResult(null); setError(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  const plan = preview?.plan
  const errors = preview?.errors ?? []

  return (
    <section className="card space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Import Property Roster</h2>
        <p className="text-sm text-ink-600">
          Upload the co-owner directory (.xlsx or .csv). Properties are matched by address; nothing is written
          until you confirm the preview. Enforcement history is never deleted.
        </p>
      </div>

      {!preview && !result && (
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="text-sm"
            onChange={e => { setFile(e.target.files?.[0] ?? null); setError(null) }}
          />
          <button className="btn-primary" disabled={!file || busy} onClick={() => post('preview')}>
            <Upload size={16} /> {busy ? 'Reading…' : 'Preview import'}
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <div className="font-semibold">{error.error}</div>
          {error.errors?.map((e, i) => <div key={i}>{e.row ? `Row ${e.row}: ` : ''}{e.message}</div>)}
          {error.completedSteps?.length > 0 && (
            <div className="mt-1">
              Failed at step <code>{error.failedStep}</code>. Completed: {error.completedSteps.join(', ')}.
              Check the sheet before retrying.
            </div>
          )}
        </div>
      )}

      {preview && (
        <div className="space-y-4">
          <div className="text-sm text-ink-600">
            Sheet <span className="font-semibold">{preview.sheetName}</span> · {plan.summary.total} owner rows read
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Stat label="New properties" n={plan.summary.newProperties} />
            <Stat label="Updated owners" n={plan.summary.updatedOwners} />
            <Stat label="Ownership changes" n={plan.summary.ownershipChanges} warn />
            <Stat label="Missing from roster" n={plan.summary.removed} warn />
            <Stat label="Errors" n={errors.length} bad />
          </div>

          {errors.length > 0 && (
            <Block title="Errors — must be fixed in the file before importing" tone="bad">
              {errors.map((e, i) => <li key={i}>{e.row ? `Row ${e.row}: ` : ''}{e.message}</li>)}
            </Block>
          )}

          {plan.ownershipChanges.length > 0 && (
            <Block title="Ownership changes" tone="warn">
              {plan.ownershipChanges.map(c => (
                <li key={c.property.id}>
                  <span className="font-semibold">{c.property.property_address}</span>:{' '}
                  {c.previousOwner ? <>{c.previousOwner.name} → </> : <>(no current owner) → </>}
                  {c.record.name}
                  {c.openCases.length > 0 && (
                    <span className="text-amber-800">
                      {' '}· {c.openCases.length} open case(s) closed
                      {c.pendingEvents.length > 0 && `, ${c.pendingEvents.length} pending notice(s) cancelled`}
                      {c.unsentFines.length > 0 && `, ${c.unsentFines.length} unsent fine(s) voided`}; new owner starts at zero
                    </span>
                  )}
                </li>
              ))}
            </Block>
          )}

          {plan.newProperties.length > 0 && (
            <Block title="New properties">
              {plan.newProperties.map(({ record }) => (
                <li key={record.row}><span className="font-semibold">{record.property_address}</span> — {record.name} · {record.email || 'no email'}</li>
              ))}
            </Block>
          )}

          {plan.updatedOwners.length > 0 && (
            <Block title="Updated owner contact details">
              {plan.updatedOwners.map(u => (
                <li key={u.property.id}>
                  <span className="font-semibold">{u.property.property_address}</span> ({u.owner.name}):{' '}
                  {Object.entries(u.changes).map(([f, c]) => `${f.replace(/_/g, ' ')} "${c.from || '—'}" → "${c.to || '—'}"`).join('; ')}
                </li>
              ))}
            </Block>
          )}

          {plan.removed.length > 0 && (
            <Block title="In the sheet but missing from this roster" tone="warn">
              {plan.removed.map(r => (
                <li key={r.property.id}><span className="font-semibold">{r.property.property_address}</span>{r.owner ? ` — ${r.owner.name}` : ''}</li>
              ))}
              <li className="list-none pt-2">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={deactivateMissing} onChange={e => setDeactivateMissing(e.target.checked)} />
                  Mark these properties inactive (their history is kept; untick to leave them as-is)
                </label>
              </li>
            </Block>
          )}

          <div className="text-sm text-ink-500">{plan.summary.unchanged} properties unchanged.</div>

          <div className="flex flex-wrap gap-3">
            <button className="btn-primary" disabled={busy || errors.length > 0} onClick={() => post('apply')}>
              {busy ? 'Importing…' : 'Confirm and import'}
            </button>
            <button className="btn-secondary" disabled={busy} onClick={reset}>Cancel</button>
          </div>
        </div>
      )}

      {result && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-green-800"><CheckCircle2 size={18} /> <span className="font-semibold">Roster imported.</span></div>
          <ul className="text-sm text-ink-700 grid grid-cols-2 gap-x-6 md:grid-cols-3">
            <li>{result.written.properties} new properties</li>
            <li>{result.written.owners} new owners</li>
            <li>{result.written.updatedOwners} contact updates</li>
            <li>{result.written.endedOwnerships} ownerships ended</li>
            <li>{result.written.closedCases} cases closed</li>
            <li>{result.written.cancelledEvents} notices cancelled · {result.written.voidedFines} fines voided</li>
            <li>{result.written.propertyUpdates} property status changes</li>
          </ul>
          <button className="btn-secondary" onClick={reset}>Import another file</button>
        </div>
      )}
    </section>
  )
}

function Stat({ label, n, warn, bad }) {
  const tone = n > 0 && bad ? 'text-red-700' : n > 0 && warn ? 'text-amber-700' : ''
  return (
    <div className="rounded-md border border-ink-200 p-3">
      <div className="label">{label}</div>
      <div className={`text-2xl font-semibold ${tone}`}>{n}</div>
    </div>
  )
}

function Block({ title, tone, children }) {
  const cls = tone === 'bad' ? 'border-red-200 bg-red-50' : tone === 'warn' ? 'border-amber-200 bg-amber-50' : 'border-ink-200'
  return (
    <div className={`rounded-md border p-3 ${cls}`}>
      <div className="mb-1 flex items-center gap-2 text-sm font-semibold">
        {tone && <AlertTriangle size={14} />} {title}
      </div>
      <ul className="list-disc pl-5 text-sm space-y-0.5">{children}</ul>
    </div>
  )
}
