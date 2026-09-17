// Notice generation and delivery — the seam Phases 6–8 fill in.
//
// afterApproval(ctx) runs inside the approval writeSteps once the event is
// APPROVED. It will: render the two-page PDF from the approved template
// (Phase 6), file it in Drive (Phase 7), email it from the HOA Gmail account
// and write the NOTICES row with the message id (Phase 8). Owner with no
// email → MANUAL_DELIVERY_REQUIRED; Gmail failure → EMAIL_FAILED, never a
// duplicate event or fine.
//
// Until then it does no I/O and returns an audit entry saying the notice is
// still to be generated, so the trail never implies a letter went out.

import { newId } from './ids.js'

export async function afterApproval({ event, violation, user, at }) {
  if (event.event_type === 'MANUAL_ACTION') {
    return { status: 'NO_NOTICE', auditRows: [] }
  }
  return {
    status: 'NOTICE_PENDING_GENERATION',
    auditRows: [{
      id: newId('AUD'), user_id: user.id, user_name: user.name,
      entity_type: 'ENFORCEMENT_EVENT', entity_id: event.id, action: 'NOTICE_PENDING_GENERATION',
      old_value: '', new_value: JSON.stringify({ template: templateFor(event), case: violation.case_number }),
      reason: 'Notice engine not yet built (Phases 6–8); no letter has been generated or sent', created_at: at,
    }],
  }
}

export function templateFor(event) {
  return event.event_type === 'FINAL_WARNING' ? 'FINAL_WARNING' : 'STANDARD_WARNING'
}
