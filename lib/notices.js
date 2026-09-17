// Notice generation and delivery (Phases 6–8). Runs inside the approval
// writeSteps once the event is APPROVED:
//
//   render PDF → file in Drive → NOTICES row (GENERATED)
//     → owner has email?  send from the HOA Gmail → SENT with message id
//                         Gmail fails           → EMAIL_FAILED (retryable)
//     → no email          → MANUAL_DELIVERY_REQUIRED
//
// A retry never re-approves, never creates a second fine, and never
// re-renders a letter that already exists in Drive: it re-sends the filed
// PDF. Approval refuses up front (noticeReadiness) while any letter or email
// input is still NEEDS_BOARD_INPUT, so a Board member fixes configuration
// before anything is half-done.

import { readTabs, readSettings, appendRow, appendRows, updateRow, writeSteps } from './sheets.js'
import { buildLetterModel, missingLetterInputs } from './letter.js'
import { renderNoticePdf } from './pdf.js'
import { uploadPdf, downloadFile, tryDownload, driveConfigured } from './drive.js'
import { sendMail, fillTemplate } from './gmail.js'
import { NEEDS_INPUT } from './seed.js'
import { newId } from './ids.js'
import { nowISO, toDateISO, formatDate } from './time.js'

const isSet = v => v != null && String(v).trim() !== '' && String(v).trim() !== NEEDS_INPUT

export function templateFor(event) {
  return event.event_type === 'FINAL_WARNING' ? 'FINAL_WARNING' : 'STANDARD_WARNING'
}

// Everything approval needs before it may proceed. Returns [] when ready.
export function noticeReadiness({ event, rule, settings, ownerEmail }) {
  if (event.event_type === 'MANUAL_ACTION') return []
  const missing = missingLetterInputs({ rule, settings })
  if (!driveConfigured()) missing.push('GOOGLE_DRIVE_FOLDER_ID (environment)')
  if (ownerEmail) {
    if (!isSet(settings.notice_email_subject)) missing.push('HOA_SETTINGS.notice_email_subject')
    if (!isSet(settings.notice_email_body)) missing.push('HOA_SETTINGS.notice_email_body')
  }
  return missing
}

const money = n => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
const ordinal = n => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]) }

export function emailVars({ violation, event, rule, property, settings }) {
  return {
    owner_name: violation.owner_name_snapshot,
    property_address: property?.property_address ?? '',
    rule_name: rule?.name ?? '',
    offense: `${ordinal(Number(violation.offense_number) || Number(event.step_number) || 1)} Offense`,
    action: event.action_name,
    deadline: formatDate(violation.actual_deadline || violation.default_deadline),
    fine: money(event.fine_amount),
    case_number: violation.case_number,
    hoa_name: settings.hoa_display_name || settings.hoa_legal_name || '',
  }
}

function auditRow(user, at, entity_id, action, new_value, reason = '') {
  return {
    id: newId('AUD'), user_id: user.id, user_name: user.name, entity_type: 'NOTICE', entity_id, action,
    old_value: '', new_value: JSON.stringify(new_value), reason, created_at: at,
  }
}

// Sends a filed PDF to the owner; returns the NOTICES patch + audit row.
async function deliver({ notice, pdf, ctx, user, at }) {
  const { violation, settings } = ctx
  const to = violation.owner_email_snapshot
  if (!to) {
    return {
      patch: { status: 'MANUAL_DELIVERY_REQUIRED', recipient_email: '', error: 'Owner has no email on the roster' },
      audit: auditRow(user, at, notice.id, 'NOTICE_MANUAL_DELIVERY_REQUIRED', { case: violation.case_number }, 'Owner has no email; print and mail the filed PDF'),
    }
  }
  const vars = emailVars(ctx)
  try {
    const sent = await sendMail({
      to,
      subject: fillTemplate(settings.notice_email_subject, vars),
      text: fillTemplate(settings.notice_email_body, vars),
      attachments: [{ filename: notice.fileName, mimeType: 'application/pdf', content: pdf }],
    })
    return {
      patch: { status: 'SENT', sent_at: nowISO(), recipient_email: to, gmail_message_id: sent.id, error: '' },
      audit: auditRow(user, at, notice.id, 'NOTICE_SENT', { to, gmail_message_id: sent.id, case: violation.case_number }),
    }
  } catch (e) {
    return {
      patch: { status: 'EMAIL_FAILED', recipient_email: to, error: String(e.message).slice(0, 500) },
      audit: auditRow(user, at, notice.id, 'NOTICE_EMAIL_FAILED', { to, case: violation.case_number }, e.message),
    }
  }
}

// ctx: { event (APPROVED), violation, rule, property, owner, settings?, user, at }
export async function afterApproval(ctx) {
  const { event, violation, rule, property, owner, user, at } = ctx
  if (event.event_type === 'MANUAL_ACTION') return { status: 'NO_NOTICE', auditRows: [] }
  const settings = ctx.settings ?? await readSettings()
  const full = { ...ctx, settings }

  const model = buildLetterModel({ violation, event, rule, property, owner, settings, noticeDate: toDateISO(at) })
  const [logoPng, signaturePng] = await Promise.all([
    tryDownload(settings.logo_drive_file_id), tryDownload(settings.manager_signature_drive_file_id),
  ])
  const pdf = await renderNoticePdf(model, { logoPng, signaturePng })
  const fileName = `${violation.case_number} - Step ${event.step_number} - ${model.templateType} - ${toDateISO(at)}.pdf`
  const file = await uploadPdf(fileName, pdf)

  const notice = {
    id: newId('NOT'), violation_id: violation.id, enforcement_event_id: event.id, template_type: model.templateType,
    generated_at: at, approved_at: event.approved_at || at, approved_by: event.approved_by || user.id, sent_at: '',
    recipient_email: '', gmail_message_id: '', google_drive_file_id: file.id, status: 'GENERATED', error: '', fileName,
  }
  const { fileName: _omit, ...row } = notice
  await appendRow('NOTICES', row)
  const auditRows = [auditRow(user, at, notice.id, 'NOTICE_GENERATED', { template: model.templateType, drive_file_id: file.id, file: fileName, case: violation.case_number })]

  const d = await deliver({ notice, pdf, ctx: full, user, at })
  await updateRow('NOTICES', notice.id, d.patch)
  auditRows.push(d.audit)
  return { status: d.patch.status, noticeId: notice.id, driveFileId: file.id, auditRows }
}

// Retry for an approved event: re-send an EMAIL_FAILED / MANUAL notice from
// the filed PDF, or generate the notice if approval was interrupted before
// the NOTICES row was written. Never touches the event or fines.
export async function retryNotice(eventId, user) {
  const [d, settings] = await Promise.all([
    readTabs('ENFORCEMENT_EVENTS', 'VIOLATIONS', 'VIOLATION_RULES', 'PROPERTIES', 'OWNERS', 'NOTICES'), readSettings(),
  ])
  const event = d.ENFORCEMENT_EVENTS.find(e => e.id === eventId)
  if (!event) throw new Error('Event not found')
  if (event.status !== 'APPROVED') throw new Error('Only approved events have notices')
  const violation = d.VIOLATIONS.find(v => v.id === event.violation_id)
  const ctx = {
    event, violation,
    rule: d.VIOLATION_RULES.find(r => r.id === violation.rule_id),
    property: d.PROPERTIES.find(p => p.id === violation.property_id),
    owner: d.OWNERS.find(o => o.id === violation.owner_id) ?? null,
    settings, user, at: nowISO(),
  }
  const missing = noticeReadiness({ event, rule: ctx.rule, settings, ownerEmail: violation.owner_email_snapshot })
  if (missing.length) throw new Error(`Cannot deliver until the Board provides: ${missing.join(', ')}`)

  const existing = d.NOTICES.filter(n => n.enforcement_event_id === eventId).sort((a, b) => String(b.generated_at).localeCompare(String(a.generated_at)))[0]
  if (!existing) {
    const r = await writeSteps([['notice', () => afterApproval(ctx)]])
    await appendRows('AUDIT_LOG', r.notice.auditRows)
    return { status: r.notice.status, regenerated: true }
  }
  if (existing.status === 'SENT') throw new Error('This notice was already sent')
  const pdf = await downloadFile(existing.google_drive_file_id)
  const notice = { ...existing, fileName: `${violation.case_number} - Step ${event.step_number} - ${existing.template_type}.pdf` }
  const res = await deliver({ notice, pdf, ctx, user, at: ctx.at })
  await writeSteps([
    ['notice', () => updateRow('NOTICES', existing.id, res.patch)],
    ['audit', () => appendRows('AUDIT_LOG', [res.audit])],
  ])
  return { status: res.patch.status, regenerated: false }
}
