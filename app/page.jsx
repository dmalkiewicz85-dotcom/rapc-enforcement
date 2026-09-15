import Link from 'next/link'
import { googleConfigStatus } from '@/lib/google'
import { loadDashboard } from '@/lib/dashboard'
import { formatDate } from '@/lib/time'
import { ordinal } from '@/lib/format'

export const dynamic = 'force-dynamic'

export default async function Dashboard() {
  const { configured, missing } = googleConfigStatus()
  if (!configured) return <NotConfigured missing={missing} />

  let data, error
  try { data = await loadDashboard() } catch (e) { error = e.message }
  if (error) return <ErrorPanel message={error} />

  const { cards, actionRequired, overdue } = data
  const CARDS = [
    ['Open Violations', cards.openViolations, '/violations?status=OPEN'],
    ['Awaiting Approval', cards.awaitingApproval, '/approvals'],
    ['Fines Awaiting Approval', cards.finesAwaitingApproval, '/approvals?fines=1'],
    ['Fines Pending PM', cards.finesPendingPM, '/fines'],
    ['Overdue Follow-Ups', cards.overdueFollowUps, '#follow-up'],
    ['Open Appeals', cards.openAppeals, '/violations?appeals=1'],
  ]

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <h1 className="text-2xl font-semibold uppercase tracking-wide">Reserves at Park Creek Enforcement</h1>
        <Link href="/violations/new" className="btn-primary">New Violation</Link>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        {CARDS.map(([label, n, href]) => (
          <Link key={label} href={href} className="card hover:border-brand-300">
            <div className="label">{label}</div>
            <div className="text-3xl font-semibold">{n}</div>
          </Link>
        ))}
      </div>

      <section>
        <h2 className="text-lg font-semibold mb-3">My Action Required</h2>
        {actionRequired.length === 0 ? (
          <p className="text-sm text-ink-500">Nothing is waiting on the Board.</p>
        ) : (
          <ul className="divide-y divide-ink-200 card p-0">
            {actionRequired.map(a => (
              <li key={a.eventId} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                <div>
                  <div className="font-semibold">{a.property}</div>
                  <div className="text-sm text-ink-600">
                    {a.rule} — {ordinal(a.offense)} Offense
                    {a.fine > 0 ? ` · $${a.fine} Fine — Board Approval Required` : ` · ${a.action} — Approval Required`}
                  </div>
                </div>
                <Link href={`/violations/${a.id}`} className="btn-secondary">Review</Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section id="follow-up">
        <h2 className="text-lg font-semibold mb-3">Follow-Up — Past Deadline</h2>
        {overdue.length === 0 ? (
          <p className="text-sm text-ink-500">No open cases are past their compliance deadline.</p>
        ) : (
          <div className="card p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-ink-100 text-left text-xs uppercase text-ink-500">
                <tr>
                  <th className="px-4 py-2">Property</th>
                  <th className="px-4 py-2">Violation</th>
                  <th className="px-4 py-2">Deadline</th>
                  <th className="px-4 py-2">Days Overdue</th>
                  <th className="px-4 py-2">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-200">
                {overdue.map(o => (
                  <tr key={o.id}>
                    <td className="px-4 py-2 font-medium">{o.property}</td>
                    <td className="px-4 py-2">{o.rule}</td>
                    <td className="px-4 py-2">{formatDate(o.deadline)}</td>
                    <td className="px-4 py-2 text-red-700 font-semibold">{o.daysOverdue}</td>
                    <td className="px-4 py-2"><Link href={`/violations/${o.id}`} className="btn-secondary py-1">Review</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

function NotConfigured({ missing }) {
  return (
    <div className="card max-w-2xl">
      <h1 className="text-xl font-semibold mb-2">Google connection not configured</h1>
      <p className="text-sm text-ink-600 mb-3">
        The app stores everything in a Google Sheet and needs these environment variables:
      </p>
      <ul className="font-mono text-sm mb-3">{missing.map(m => <li key={m}>{m}</li>)}</ul>
      <p className="text-sm text-ink-600">
        Follow <code>docs/SETUP_GOOGLE.md</code>, then run <code>npm run google:authorize</code> and <code>npm run sheets:init</code>.
      </p>
    </div>
  )
}

function ErrorPanel({ message }) {
  return (
    <div className="card border-red-200 max-w-2xl">
      <h1 className="text-xl font-semibold mb-2 text-red-800">Could not load dashboard</h1>
      <p className="text-sm font-mono">{message}</p>
    </div>
  )
}
