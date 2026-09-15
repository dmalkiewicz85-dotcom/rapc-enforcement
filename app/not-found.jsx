import Link from 'next/link'
export default function NotFound() {
  return (
    <div className="py-24 text-center">
      <div className="text-6xl font-bold text-ink-200 mb-4">404</div>
      <p className="text-ink-500 mb-6">That page does not exist.</p>
      <Link href="/" className="btn-primary">Back to Dashboard</Link>
    </div>
  )
}
