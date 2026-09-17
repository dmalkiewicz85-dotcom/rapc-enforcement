import Link from 'next/link'
import { googleConfigStatus } from '@/lib/google'
import { loadProperties } from '@/lib/properties'

export const dynamic = 'force-dynamic'

export default async function Page({ searchParams }) {
  const { q = '' } = await searchParams
  const { configured } = googleConfigStatus()
  if (!configured) return <p className="text-sm text-ink-500">Google connection not configured.</p>

  let properties, error
  try { properties = await loadProperties(q) } catch (e) { error = e.message }
  if (error) return <p className="text-sm font-mono text-red-800">{error}</p>

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Properties</h1>
        <form className="flex gap-2">
          <input name="q" defaultValue={q} placeholder="Search address or owner…" className="input w-64" />
          <button className="btn-secondary">Search</button>
        </form>
      </div>

      {properties.length === 0 ? (
        <p className="text-sm text-ink-500">
          {q ? 'No properties match.' : 'No properties yet — import the roster from Admin.'}
        </p>
      ) : (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-ink-100 text-left text-xs uppercase text-ink-500">
              <tr>
                <th className="px-4 py-2">Address</th>
                <th className="px-4 py-2">Current owner</th>
                <th className="px-4 py-2">Email</th>
                <th className="px-4 py-2 text-right">Open</th>
                <th className="px-4 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-200">
              {properties.map(p => (
                <tr key={p.id} className={p.active !== 'Y' ? 'text-ink-400' : ''}>
                  <td className="px-4 py-2 font-medium">
                    <Link href={`/properties/${p.id}`} className="hover:underline">{p.property_address}</Link>
                    {p.active !== 'Y' && <span className="ml-2 text-xs uppercase">inactive</span>}
                  </td>
                  <td className="px-4 py-2">{p.owner?.name ?? <span className="text-ink-400">No current owner</span>}</td>
                  <td className="px-4 py-2 text-ink-600">{p.owner?.email}</td>
                  <td className={`px-4 py-2 text-right ${p.openCount ? 'font-semibold text-amber-700' : ''}`}>{p.openCount}</td>
                  <td className="px-4 py-2 text-right">{p.violations.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-ink-500">{properties.length} {properties.length === 1 ? 'property' : 'properties'}</p>
    </div>
  )
}
