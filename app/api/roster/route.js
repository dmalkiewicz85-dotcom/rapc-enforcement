import { currentUser } from '@/lib/current-user'
import { can } from '@/lib/schema'
import { previewRoster, applyRoster } from '@/lib/roster-import'

export const dynamic = 'force-dynamic'

// multipart/form-data: file, mode=preview|apply, deactivateMissing=1
// The plan is always recomputed from the uploaded file against the sheet as
// it is right now, so a stale preview can never be applied.
export async function POST(req) {
  const user = await currentUser()
  if (!can(user, 'import_roster')) {
    return Response.json({ error: 'Only a Board Administrator can import the roster' }, { status: 403 })
  }
  const form = await req.formData()
  const file = form.get('file')
  if (!file || typeof file === 'string') return Response.json({ error: 'No file uploaded' }, { status: 400 })
  const mode = form.get('mode') === 'apply' ? 'apply' : 'preview'
  const deactivateMissing = form.get('deactivateMissing') === '1'

  let preview
  try {
    preview = await previewRoster(Buffer.from(await file.arrayBuffer()))
  } catch (e) {
    return Response.json({ error: `Could not read the file: ${e.message}` }, { status: 400 })
  }
  if (mode === 'preview') return Response.json(preview)
  if (preview.errors.length) {
    return Response.json({ error: 'The roster has errors; fix them and re-upload', errors: preview.errors }, { status: 400 })
  }
  try {
    const result = await applyRoster(preview.plan, user, { deactivateMissing })
    return Response.json({ ok: true, ...result })
  } catch (e) {
    return Response.json({ error: e.message, completedSteps: e.completedSteps ?? [], failedStep: e.failedStep ?? null }, { status: 500 })
  }
}
