// Manually recorded appeals (spec, APPEALS): no homeowner portal; a Board
// member records that an appeal was received and, later, the decision.

import { readTabs, appendRow, appendRows, updateRow, writeSteps } from './sheets.js'
import { can } from './schema.js'
import { newId } from './ids.js'
import { nowISO, todayISO, toDateISO } from './time.js'

const audit = (user, at, entity_id, action, new_value, reason = '') => ({
  id: newId('AUD'), user_id: user.id, user_name: user.name, entity_type: 'APPEAL', entity_id, action,
  old_value: '', new_value: JSON.stringify(new_value), reason, created_at: at,
})

export async function recordAppeal(violationId, { appealDate, description }, user) {
  if (!can(user, 'review')) throw new Error('Your role cannot record appeals')
  const d = await readTabs('VIOLATIONS')
  const v = d.VIOLATIONS.find(x => x.id === violationId)
  if (!v) throw new Error('Case not found')
  const at = nowISO()
  const row = {
    id: newId('APL'), violation_id: violationId, appeal_date: toDateISO(appealDate) || todayISO(), received_by: user.id,
    description: String(description ?? '').trim(), status: 'RECEIVED', board_decision: '', decision_date: '', created_at: at,
  }
  if (!row.description) throw new Error('Describe the appeal')
  await writeSteps([
    ['appeal', () => appendRow('APPEALS', row)],
    ['audit', () => appendRows('AUDIT_LOG', [audit(user, at, row.id, 'APPEAL_RECEIVED', { case: v.case_number, appeal_date: row.appeal_date }, row.description)])],
  ])
  return row
}

// status: UNDER_REVIEW (no decision yet) or DECIDED (with board_decision).
export async function updateAppeal(appealId, { status, boardDecision = '' }, user) {
  if (!can(user, 'approve_enforcement')) throw new Error('Your role cannot decide appeals')
  if (!['UNDER_REVIEW', 'DECIDED'].includes(status)) throw new Error('Status must be UNDER_REVIEW or DECIDED')
  const decision = String(boardDecision ?? '').trim()
  if (status === 'DECIDED' && !decision) throw new Error('Record the Board decision')
  const at = nowISO()
  const patch = { status, board_decision: decision, decision_date: status === 'DECIDED' ? todayISO() : '' }
  await writeSteps([
    ['appeal', () => updateRow('APPEALS', appealId, patch)],
    ['audit', () => appendRows('AUDIT_LOG', [audit(user, at, appealId, status === 'DECIDED' ? 'APPEAL_DECIDED' : 'APPEAL_UNDER_REVIEW', patch, decision)])],
  ])
  return patch
}
