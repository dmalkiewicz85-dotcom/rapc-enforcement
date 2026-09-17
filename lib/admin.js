// Configuration edits (spec, RULE CONFIGURATION / HOA CONFIGURATION / users).
// Every change is a patch by id with the old and new values in AUDIT_LOG.
// Column lists below are the only fields the UI may change; ids, rule
// linkage, and audit columns are never editable.

import { readTabs, appendRows, appendRow, updateRow, writeSteps } from './sheets.js'
import { can, ROLES } from './schema.js'
import { newId } from './ids.js'
import { nowISO } from './time.js'
import { missingLetterInputs } from './letter.js'

export const EDITABLE_RULE = [
  'name', 'active', 'initiating_authority', 'governing_document', 'governing_section', 'governing_text',
  'corrective_action_text', 'default_deadline_days', 'offense_window_days', 'reset_on_compliance', 'notes',
]
export const EDITABLE_STEP = [
  'action_name', 'fine_amount', 'deadline_days', 'is_final_warning', 'is_fine', 'is_recurring', 'recurrence_days',
  'requires_board_approval', 'manual_action_required', 'template_type', 'notes',
]
export const EDITABLE_USER = ['name', 'email', 'role', 'active']

// Settings the UI shows, with a hint. Unknown keys in the sheet still show.
export const SETTING_HINTS = {
  hoa_legal_name: 'Printed at the top of every notice and as the association name on the response form.',
  hoa_display_name: 'Short name used in the app.',
  enforcement_email: 'The Gmail account notices are sent from.',
  management_company_name: 'Signs the notice as agent for the HOA.',
  management_company_address: 'Printed under the response form and in the return-to line.',
  management_company_tagline: 'Optional line under the response form.',
  manager_name: 'Signature block on the notice.',
  manager_email: 'Owners are told to respond in writing to this address.',
  manager_signature_drive_file_id: 'Drive file id of a PNG signature (optional).',
  logo_drive_file_id: 'Drive file id of a PNG logo for the response form (optional).',
  pm_report_recipient_email: 'Where the PM fine report is emailed.',
  notice_email_subject: 'Email subject. Placeholders: {owner_name} {property_address} {rule_name} {offense} {action} {deadline} {fine} {case_number} {hoa_name}',
  notice_email_body: 'Email body (plain text). Same placeholders.',
  property_city: 'Fills owner mailing city on roster import.',
  property_state: 'Fills owner mailing state on roster import.',
  property_zip: 'Fills owner mailing ZIP on roster import.',
  arc_may_approve_fines: 'Y lets ARC members approve fines.',
  timezone: 'Display timezone (America/Detroit).',
}

const audit = (user, at, entity_type, entity_id, action, old_value, new_value) => ({
  id: newId('AUD'), user_id: user.id, user_name: user.name, entity_type, entity_id, action,
  old_value: JSON.stringify(old_value), new_value: JSON.stringify(new_value), reason: '', created_at: at,
})

const pick = (obj, keys) => Object.fromEntries(Object.entries(obj).filter(([k]) => keys.includes(k)))

export async function loadAdmin() {
  const d = await readTabs('VIOLATION_RULES', 'RULE_ENFORCEMENT_STEPS', 'HOA_SETTINGS', 'USERS')
  const settings = Object.fromEntries(d.HOA_SETTINGS.map(r => [r.key, r.value]))
  const rules = d.VIOLATION_RULES.map(r => ({
    ...r,
    steps: d.RULE_ENFORCEMENT_STEPS.filter(s => s.rule_id === r.id).sort((a, b) => Number(a.step_number) - Number(b.step_number)),
    missingLetterInputs: missingLetterInputs({ rule: r, settings }).filter(m => m.startsWith('VIOLATION_RULES')),
  }))
  return {
    settings: d.HOA_SETTINGS,
    settingsMissing: missingLetterInputs({ rule: {}, settings }).filter(m => m.startsWith('HOA_SETTINGS')),
    rules, users: d.USERS,
  }
}

export async function updateSetting(key, value, user) {
  if (!can(user, 'manage_settings')) throw new Error('Your role cannot change HOA settings')
  const at = nowISO()
  const rows = (await readTabs('HOA_SETTINGS')).HOA_SETTINGS
  const row = rows.find(r => r.key === key)
  const patch = { value: String(value ?? ''), updated_at: at, updated_by: user.id }
  await writeSteps([
    ['setting', () => row ? updateRow('HOA_SETTINGS', key, patch) : appendRow('HOA_SETTINGS', { key, ...patch })],
    ['audit', () => appendRows('AUDIT_LOG', [audit(user, at, 'HOA_SETTINGS', key, 'SETTING_UPDATED', row?.value ?? null, patch.value)])],
  ])
  return patch
}

export async function updateRule(id, patchIn, user) {
  if (!can(user, 'manage_rules')) throw new Error('Your role cannot change rules')
  const patch = pick(patchIn, EDITABLE_RULE)
  if (!Object.keys(patch).length) throw new Error('Nothing to change')
  const at = nowISO()
  const old = (await readTabs('VIOLATION_RULES')).VIOLATION_RULES.find(r => r.id === id)
  if (!old) throw new Error('Rule not found')
  await writeSteps([
    ['rule', () => updateRow('VIOLATION_RULES', id, patch)],
    ['audit', () => appendRows('AUDIT_LOG', [audit(user, at, 'VIOLATION_RULE', id, 'RULE_UPDATED', pick(old, Object.keys(patch)), patch)])],
  ])
  return patch
}

export async function updateStep(id, patchIn, user) {
  if (!can(user, 'manage_rules')) throw new Error('Your role cannot change enforcement steps')
  const patch = pick(patchIn, EDITABLE_STEP)
  if (!Object.keys(patch).length) throw new Error('Nothing to change')
  if ('fine_amount' in patch) {
    const n = Number(patch.fine_amount)
    if (Number.isNaN(n) || n < 0) throw new Error('Fine must be a non-negative number')
    patch.fine_amount = n
    patch.is_fine = n > 0 ? 'Y' : 'N'
  }
  const at = nowISO()
  const old = (await readTabs('RULE_ENFORCEMENT_STEPS')).RULE_ENFORCEMENT_STEPS.find(s => s.id === id)
  if (!old) throw new Error('Step not found')
  await writeSteps([
    ['step', () => updateRow('RULE_ENFORCEMENT_STEPS', id, patch)],
    ['audit', () => appendRows('AUDIT_LOG', [audit(user, at, 'RULE_STEP', id, 'STEP_UPDATED', pick(old, Object.keys(patch)), patch)])],
  ])
  return patch
}

export async function saveUser(input, user) {
  if (!can(user, 'manage_users')) throw new Error('Your role cannot manage users')
  const patch = pick(input, EDITABLE_USER)
  if (patch.role && !ROLES.includes(patch.role)) throw new Error(`Role must be one of ${ROLES.join(', ')}`)
  if (patch.email) patch.email = String(patch.email).trim().toLowerCase()
  const at = nowISO()
  if (input.id) {
    const old = (await readTabs('USERS')).USERS.find(u => u.id === input.id)
    if (!old) throw new Error('User not found')
    if (old.id === user.id && patch.active === 'N') throw new Error('You cannot deactivate yourself')
    await writeSteps([
      ['user', () => updateRow('USERS', input.id, patch)],
      ['audit', () => appendRows('AUDIT_LOG', [audit(user, at, 'USER', input.id, 'USER_UPDATED', pick(old, Object.keys(patch)), patch)])],
    ])
    return { id: input.id, ...patch }
  }
  if (!patch.name?.trim() || !patch.role) throw new Error('Name and role are required')
  const row = { id: newId('USER'), name: patch.name.trim(), email: patch.email ?? '', role: patch.role, active: 'Y', created_at: at }
  await writeSteps([
    ['user', () => appendRow('USERS', row)],
    ['audit', () => appendRows('AUDIT_LOG', [audit(user, at, 'USER', row.id, 'USER_CREATED', null, row)])],
  ])
  return row
}
