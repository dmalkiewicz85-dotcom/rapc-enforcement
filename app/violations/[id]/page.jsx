import Link from 'next/link'
import { notFound } from 'next/navigation'
import { loadViolation } from '@/lib/violations'
import { currentUser } from '@/lib/current-user'
import { can } from '@/lib/schema'
import MarkCompliant from '@/components/MarkCompliant'
import NoticeActions from '@/components/NoticeActions'
import Appeals from '@/components/Appeals'
import { formatDate, formatDateTime, todayISO } from '@/lib/time'
import { ordinal, money } from '@/lib/format'

export const dynamic = 'force-dynamic'

const EVENT_STATUS = {
  PENDING_BOARD_APPROVAL: ['Awaiting Board approval', 'bg-amber-100 text-amber-900'],
  APPROVED: ['Approved', 'bg-green-100 text-green-900'],
  REJECTED: ['Rejected', 'bg-red-100 text-red-900'],
  CANCELLED: ['Cancelled', 'bg-ink-100 text-ink-600'],
}

export default async function Page({ params }) {
  const { id } = await params
  const [v, user] = await Promise.all([loadViolation(id), currentUser()])
  if (!v) notFound()
  const pendingCount = v.events.filter(e => e.status === 'PENDING_BOARD_APPROVAL').length
  const approver = can(user, 'approve_enforcement')
  // Approved, letter-bearing events with no NOTICES row: approval was interrupted before filing.
  const unfiled = v.events.filter(e => e.status === 'APPROVED' && e.event_type !== 'MANUAL_ACTION' && !v.notices.some(n => n.enforcement_event_id === e.id))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/violations" className="text-sm text-ink-500 hover:underline">← Violations</Link>
          <h1 className="text-2xl font-semibold">{v.case_number}</h1>
          <div className="text-ink-600">
            <Link href={`/properties/${v.property_id}`} className="hover:underline">{v.property?.property_address ?? v.property_id}</Link>
            {' · '}{v.rule?.name ?? v.rule_id}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 text-sm">
          <Badge status={v.status === 'CLOSED' ? 'CLOSED' : v.pendingEvent ? 'PENDING' : v.overdueDays > 0 ? 'OVERDUE' : 'OPEN'} days={v.overdueDays} compliant={v.compliance_status === 'COMPLIANT'} />
          {v.status === 'OPEN' && can(user, 'mark_compliant') && <MarkCompliant violationId={v.id} pendingCount={pendingCount} />}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card">
          <h2 className="label">Case</h2>
          <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
            <Row k="Offense" v={`${ordinal(Number(v.offense_number))} Offense`} />
            <Row k="Date observed" v={formatDate(v.date_observed)} />
            <Row k="Deadline" v={<>{formatDate(v.deadline) || '—'}{v.deadline_overridden === 'Y' && <span className="text-ink-500"> (overridden from {formatDate(v.default_deadline) || 'none'}: {v.deadline_override_reason})</span>}</>} />
            <Row k="Compliance" v={v.compliance_status === 'COMPLIANT' ? `Confirmed ${formatDate(v.compliance_date)}` : 'Pending'} />
            <Row k="Submitted" v={`${formatDateTime(v.created_at)} by ${v.createdByName}`} />
            {v.closed_at && <Row k="Closed" v={formatDateTime(v.closed_at)} />}
          </dl>
        </section>

        <section className="card">
          <h2 className="label">Owner at the time of the violation</h2>
          <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
            <Row k="Name" v={v.owner_name_snapshot} />
            <Row k="Email" v={v.owner_email_snapshot || <span className="text-red-700">none — manual delivery</span>} />
            <Row k="Mailing" v={v.owner_mailing_snapshot} />
          </dl>
        </section>
      </div>

      <section className="card space-y-3">
        <h2 className="label">Description (appears in the notice)</h2>
        <p className="whitespace-pre-line text-sm">{v.description}</p>
        {v.internal_notes && (
          <>
            <h2 className="label pt-2">Internal notes (never sent to the owner)</h2>
            <p className="whitespace-pre-line text-sm text-ink-600">{v.internal_notes}</p>
          </>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Enforcement events</h2>
        <div className="card p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-ink-100 text-left text-xs uppercase text-ink-500">
              <tr>
                <th className="px-4 py-2">Step</th>
                <th className="px-4 py-2">Action</th>
                <th className="px-4 py-2">Fine</th>
                <th className="px-4 py-2">Due</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Created</th>
                <th className="px-4 py-2">Approved</th>
                <th className="px-4 py-2">Notice</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-200">
              {v.events.map(e => {
                const [label, cls] = EVENT_STATUS[e.status] ?? [e.status, '']
                return (
                  <tr key={e.id}>
                    <td className="px-4 py-2">{e.step_number}</td>
                    <td className="px-4 py-2">{e.action_name}{e.override === 'Y' && <span className="text-ink-500"> (override: {e.override_reason})</span>}</td>
                    <td className="px-4 py-2">{Number(e.fine_amount) > 0 ? money(e.fine_amount) : ''}</td>
                    <td className="px-4 py-2">{formatDate(e.due_at)}</td>
                    <td className="px-4 py-2"><span className={`rounded px-2 py-0.5 text-xs font-semibold ${cls}`}>{label}</span></td>
                    <td className="px-4 py-2 text-ink-600">{formatDateTime(e.created_at)}</td>
                    <td className="px-4 py-2 text-ink-600">{e.approved_at ? formatDateTime(e.approved_at) : ''}</td>
                    <td className="px-4 py-2">
                      {e.event_type !== 'MANUAL_ACTION' && !['CANCELLED', 'REJECTED'].includes(e.status) && (
                        <a href={`/api/notices/preview?event=${e.id}`} target="_blank" rel="noreferrer" className="underline">Preview PDF</a>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {v.pendingEvent && can(user, 'approve_enforcement') && (
          <p className="mt-2 text-sm text-ink-600">
            Step {v.pendingEvent.step_number} is waiting on the Board — <Link href="/approvals" className="underline">review it on Board Approvals</Link>.
          </p>
        )}
      </section>

      {(v.notices.length > 0 || v.fines.length > 0 || unfiled.length > 0) && (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="card">
            <h2 className="label">Notices</h2>
            {v.notices.length === 0 && unfiled.length === 0 ? <p className="text-sm text-ink-500">None yet.</p> : (
              <ul className="text-sm space-y-2">
                {v.notices.map(n => (
                  <li key={n.id} className="flex flex-wrap items-center gap-2">
                    <span>
                      {n.template_type.replace(/_/g, ' ')} · <span className="font-semibold">{n.status.replace(/_/g, ' ')}</span>
                      {n.sent_at ? ` · sent ${formatDateTime(n.sent_at)} to ${n.recipient_email}` : ` · generated ${formatDateTime(n.generated_at)}`}
                      {n.error && <span className="text-red-700"> · {n.error}</span>}
                    </span>
                    {n.google_drive_file_id && <a href={`https://drive.google.com/file/d/${n.google_drive_file_id}/view`} target="_blank" rel="noreferrer" className="underline">Drive</a>}
                    {approver && ['EMAIL_FAILED', 'MANUAL_DELIVERY_REQUIRED'].includes(n.status) && (
                      <NoticeActions eventId={n.enforcement_event_id} label={n.status === 'EMAIL_FAILED' ? 'Retry email' : 'Try email again'} />
                    )}
                  </li>
                ))}
                {unfiled.map(e => (
                  <li key={e.id} className="flex flex-wrap items-center gap-2 text-amber-900">
                    <span>Step {e.step_number} approved but no notice was filed.</span>
                    {approver && <NoticeActions eventId={e.id} label="Generate and send" />}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="card">
            <h2 className="label">Fines</h2>
            {v.fines.length === 0 ? <p className="text-sm text-ink-500">None.</p> : (
              <ul className="text-sm space-y-1">
                {v.fines.map(f => <li key={f.id}>{money(f.amount)} · {f.status}{f.pm_notes ? ` · ${f.pm_notes}` : ''}</li>)}
              </ul>
            )}
          </section>
        </div>
      )}

      <Appeals violationId={v.id} appeals={v.appeals} canRecord={can(user, 'review')} canDecide={approver} today={todayISO()} />

      <section>
        <h2 className="text-lg font-semibold mb-3">Audit trail</h2>
        <ul className="card divide-y divide-ink-200 p-0 text-sm">
          {v.audit.map(a => (
            <li key={a.id} className="px-5 py-2">
              <div className="flex flex-wrap justify-between gap-2">
                <span className="font-medium">{a.action.replace(/_/g, ' ')}</span>
                <span className="text-ink-500">{formatDateTime(a.created_at)} · {a.user_name}</span>
              </div>
              {a.reason && <div className="text-ink-600">{a.reason}</div>}
            </li>
          ))}
          {v.audit.length === 0 && <li className="px-5 py-2 text-ink-500">No entries.</li>}
        </ul>
      </section>
    </div>
  )
}

function Row({ k, v }) {
  return (<><dt className="text-ink-500">{k}</dt><dd>{v || '—'}</dd></>)
}

function Badge({ status, days, compliant }) {
  const map = {
    CLOSED: [compliant ? 'Closed · Compliant' : 'Closed', 'bg-ink-100 text-ink-700'],
    PENDING: ['Awaiting Board approval', 'bg-amber-100 text-amber-900'],
    OVERDUE: [`Overdue ${days} day${days === 1 ? '' : 's'}`, 'bg-red-100 text-red-900'],
    OPEN: ['Open', 'bg-green-100 text-green-900'],
  }
  const [label, cls] = map[status]
  return <span className={`inline-block rounded px-3 py-1 font-semibold ${cls}`}>{label}</span>
}
