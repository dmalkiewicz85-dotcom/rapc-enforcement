import { googleConfigStatus } from '@/lib/google'

export const dynamic = 'force-dynamic'

export async function GET() {
  return Response.json({ ok: true, google: googleConfigStatus() })
}
