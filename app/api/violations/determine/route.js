import { currentUser } from '@/lib/current-user'
import { can } from '@/lib/schema'
import { previewSubmission } from '@/lib/violations'

export const dynamic = 'force-dynamic'

// Enforcement Determination preview: no write, no side effects.
export async function POST(req) {
  const user = await currentUser()
  if (!can(user, 'submit')) return Response.json({ error: 'You cannot submit violations' }, { status: 403 })
  const body = await req.json()
  try {
    const { property, owner, rule, openCase, determination, asOf } = await previewSubmission(body)
    return Response.json({
      property: { id: property.id, address: property.property_address },
      owner: { name: owner.name, email: owner.email },
      rule: { id: rule.id, name: rule.name },
      openCase: openCase ? { id: openCase.id, caseNumber: openCase.case_number, dateObserved: openCase.date_observed } : null,
      determination, asOf,
    })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 })
  }
}
