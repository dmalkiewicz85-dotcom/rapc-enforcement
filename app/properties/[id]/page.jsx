import Link from 'next/link'
import { notFound } from 'next/navigation'
import { loadProperty } from '@/lib/properties'
import { formatDate } from '@/lib/time'
import { ordinal } from '@/lib/format'

export const dynamic = 'force-dynamic'

export default async function Page({ params }) {
  const { id } = await params
  const p = await loadProperty(id)
  if (!p) notFound()
  const o = p.owner
  const mailing = o
    ? [o.mailing_address, [o.mailing_city, o.mailing_state, o.mailing_zip].filter(Boolean).join(' ')].filter(Boolean).join(', ')
    : ''

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/properties" className="text-sm text-ink-500 hover:underline">← Properties</Link>
          <h1 className="text-2xl font-semibold">{p.property_address}</h1>
          {p.active !== 'Y' && <span className="text-xs uppercase text-red-700">Inactive</span>}
        </div>
        <Link href={`/violations/new?property=${p.id}`} className="btn-primary">New Violation</Link>
      </div>

      <section className="card">
        <h2 className="label">Current owner</h2>
        {o ? (
          <dl className="grid gap-x-8 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
            <Row k="Name" v={o.name} />
            <Row k="Email" v={o.email} />
            <Row k="Phone" v={o.phone} />
            <Row k="Since" v={formatDate(p.ownership?.start_date)} />
            <Row k="Mailing address" v={mailing} />
          </dl>
        ) : <p className="text-sm text-ink-500">No current owner on record.</p>}
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Violations</h2>
        {p.violations.length === 0 ? (
          <p className="text-sm text-ink-500">No enforcement history for this property.</p>
        ) : (
          <div className="card p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-ink-100 text-left text-xs uppercase text-ink-500">
                <tr>
                  <th className="px-4 py-2">Case</th>
                  <th className="px-4 py-2">Rule</th>
                  <th className="px-4 py-2">Observed</th>
                  <th className="px-4 py-2">Offense</th>
                  <th className="px-4 py-2">Owner at the time</th>
                  <th className="px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-200">
                {p.violations.map(v => (
                  <tr key={v.id}>
                    <td className="px-4 py-2 font-medium"><Link href={`/violations/${v.id}`} className="hover:underline">{v.case_number}</Link></td>
                    <td className="px-4 py-2">{v.rule_name}</td>
                    <td className="px-4 py-2">{formatDate(v.date_observed)}</td>
                    <td className="px-4 py-2">{ordinal(Number(v.offense_number))}</td>
                    <td className="px-4 py-2 text-ink-600">{v.owner_name_snapshot}</td>
                    <td className="px-4 py-2">{v.status}{v.compliance_status === 'COMPLIANT' ? ' · Compliant' : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Ownership history</h2>
        <ul className="card divide-y divide-ink-200 p-0 text-sm">
          {p.ownershipHistory.map(h => (
            <li key={h.id} className="flex flex-wrap justify-between gap-2 px-5 py-2">
              <span className="font-medium">{h.owner?.name ?? h.owner_id}</span>
              <span className="text-ink-600">{formatDate(h.start_date)} – {h.end_date ? formatDate(h.end_date) : 'Present'}</span>
            </li>
          ))}
          {p.ownershipHistory.length === 0 && <li className="px-5 py-2 text-ink-500">None.</li>}
        </ul>
      </section>
    </div>
  )
}

function Row({ k, v }) {
  return (<><dt className="text-ink-500">{k}</dt><dd>{v || '—'}</dd></>)
}
