import { buildLetterModel } from '@/lib/letter'
import { renderNoticePdf } from '@/lib/pdf'
import { SAMPLE } from '@/lib/letter-sample'
import { todayISO } from '@/lib/time'

export const dynamic = 'force-dynamic'

// Layout preview with clearly-marked sample data. ?fine=50 to see the fine
// box, ?fine=75 to see a non-template amount. Needs no Google connection.
export async function GET(req) {
  const fine = Number(new URL(req.url).searchParams.get('fine') || 0)
  const model = buildLetterModel({
    ...SAMPLE,
    event: { ...SAMPLE.event, fine_amount: fine, event_type: fine > 0 ? 'FINE' : SAMPLE.event.event_type },
    noticeDate: todayISO(),
  })
  const bytes = await renderNoticePdf(model)
  return new Response(bytes, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="sample-notice.pdf"' } })
}
