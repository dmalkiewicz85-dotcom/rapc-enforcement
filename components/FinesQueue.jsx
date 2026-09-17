'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Download, Send } from 'lucide-react'
import { money } from '@/lib/format'
import { formatDate } from '@/lib/time'

// FINES PENDING PROPERTY MANAGEMENT: tick what goes on the report, download
// it, then record it as sent. PM (or the Board) records assessment status.
export default function FinesQueue({ pending, sent, done, canManage, canUpdateStatus }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const included = pending.filter(f => f.include_in_pm_report !== 'N')

  async function call(url, method, body) {
    setBusy(true); setError(null)
    try {
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      router.refresh()
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  return (
    <div className="space-y-8">
      {error && <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}

      <section>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h2 className="text-lg font-semibold">Fines pending Property Management <span className="text-ink-400 font-normal">({pending.length})</span></h2>
          {canManage && pending.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <a href="/api/fines/report?format=xlsx" download className="btn-secondary"><Download size={16} /> Excel</a>
              <a href="/api/fines/report?format=csv" download className="btn-secondary"><Download size={16} /> CSV</a>
              <button className="btn-primary" disabled={busy || included.length === 0}
                onClick={() => { if (confirm(`Email the report with ${included.length} fine(s) to Property Management from the HOA account?`)) call('/api/fines/email', 'POST', {}) }}>
                <Send size={16} /> Email report to PM ({included.length})
              </button>
              <button className="btn-secondary" disabled={busy || included.length === 0}
                onClick={() => { if (confirm(`Record ${included.length} fine(s) as sent to Property Management without emailing?`)) call('/api/fines/sent', 'POST', { fineIds: included.map(f => f.id) }) }}>
                Mark sent (sent another way)
              </button>
            </div>
          )}
        </div>
        <Table rows={pending} empty="No approved fines are waiting for Property Management."
          extra={f => canManage && (
            <label className="flex items-center gap-1 text-xs">
              <input type="checkbox" checked={f.include_in_pm_report !== 'N'} disabled={busy}
                onChange={e => call(`/api/fines/${f.id}`, 'PATCH', { include: e.target.checked })} />
              Include in report
            </label>
          )} />
        <p className="mt-2 text-xs text-ink-500">
          Workflow: download and review the report, then email it to Property Management from the HOA account (or mark it sent if delivered another way). Nothing goes to PM automatically.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Sent to Property Management <span className="text-ink-400 font-normal">({sent.length})</span></h2>
        <Table rows={sent} empty="Nothing awaiting assessment."
          extra={f => canUpdateStatus && <StatusForm fine={f} busy={busy} onSubmit={body => call(`/api/fines/${f.id}`, 'PATCH', body)} />} />
      </section>

      {done.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">Assessed / waived / disputed <span className="text-ink-400 font-normal">({done.length})</span></h2>
          <Table rows={done} empty="" />
        </section>
      )}
    </div>
  )
}

function Table({ rows, empty, extra }) {
  if (!rows.length) return <p className="text-sm text-ink-500">{empty}</p>
  return (
    <div className="card p-0 overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-ink-100 text-left text-xs uppercase text-ink-500">
          <tr>
            <th className="px-4 py-2">Property</th>
            <th className="px-4 py-2">Owner</th>
            <th className="px-4 py-2">Violation</th>
            <th className="px-4 py-2">Offense</th>
            <th className="px-4 py-2">Fine</th>
            <th className="px-4 py-2">Approved</th>
            <th className="px-4 py-2">Status</th>
            {extra && <th className="px-4 py-2"></th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-200">
          {rows.map(f => (
            <tr key={f.id}>
              <td className="px-4 py-2 font-medium">
                {f.violation ? <Link href={`/violations/${f.violation.id}`} className="hover:underline">{f.property?.property_address ?? f.violation.property_id}</Link> : '—'}
              </td>
              <td className="px-4 py-2">{f.violation?.owner_name_snapshot}</td>
              <td className="px-4 py-2">{f.rule?.name}</td>
              <td className="px-4 py-2">{f.event ? `Step ${f.event.step_number}` : ''}</td>
              <td className="px-4 py-2 font-semibold">{money(f.amount)}</td>
              <td className="px-4 py-2 text-ink-600">{formatDate(f.approved_at)} · {f.approvedByName}</td>
              <td className="px-4 py-2">{f.status.replace(/_/g, ' ')}{f.pm_reference ? ` · ${f.pm_reference}` : ''}{f.pm_notes ? <div className="text-xs text-ink-500">{f.pm_notes}</div> : null}</td>
              {extra && <td className="px-4 py-2">{extra(f)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function StatusForm({ fine, busy, onSubmit }) {
  const [status, setStatus] = useState('ASSESSED')
  const [reference, setReference] = useState(fine.pm_reference || '')
  const [notes, setNotes] = useState('')
  return (
    <div className="flex flex-wrap items-center gap-1">
      <select className="input w-auto py-1 text-xs" value={status} onChange={e => setStatus(e.target.value)}>
        <option value="ASSESSED">Assessed</option>
        <option value="DISPUTED">Disputed</option>
        <option value="WAIVED">Waived</option>
      </select>
      <input className="input w-28 py-1 text-xs" placeholder="PM ref" value={reference} onChange={e => setReference(e.target.value)} />
      <input className="input w-36 py-1 text-xs" placeholder="Notes" value={notes} onChange={e => setNotes(e.target.value)} />
      <button className="btn-secondary py-1 text-xs" disabled={busy} onClick={() => onSubmit({ status, reference, notes })}>Save</button>
    </div>
  )
}
