import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildMime, fillTemplate } from './gmail.js'
import { noticeReadiness, emailVars } from './notices.js'
import { SAMPLE } from './letter-sample.js'

test('buildMime: headers, text part, and a base64 PDF attachment', () => {
  const mime = buildMime({
    from: 'rapchoa@gmail.com', to: 'a@x.com, b@y.com', subject: 'Notice — VIO-2026-0001', text: 'Hello',
    attachments: [{ filename: 'n.pdf', mimeType: 'application/pdf', content: Buffer.from('%PDF-1.4') }],
  })
  assert.match(mime, /^From: rapchoa@gmail.com\r\nTo: a@x.com, b@y.com\r\nSubject: =\?UTF-8\?B\?/)
  assert.match(mime, /Content-Type: multipart\/mixed; boundary="rapc-/)
  assert.match(mime, /Content-Type: text\/plain; charset="UTF-8"/)
  assert.match(mime, /Content-Disposition: attachment; filename="n.pdf"/)
  assert.ok(mime.includes(Buffer.from('%PDF-1.4').toString('base64')))
  assert.match(buildMime({ from: 'a', to: 'b', subject: 'plain ascii', text: '' }), /Subject: plain ascii\r\n/)
})

test('fillTemplate substitutes known placeholders and leaves unknown ones', () => {
  assert.equal(fillTemplate('Dear {owner_name}, re {case_number} {nope}', { owner_name: 'Hansen', case_number: 'VIO-1' }), 'Dear Hansen, re VIO-1 {nope}')
  assert.equal(fillTemplate(undefined, {}), '')
})

test('emailVars derives every placeholder from the case', () => {
  const vars = emailVars({ ...SAMPLE, event: { ...SAMPLE.event, fine_amount: 50 } })
  assert.equal(vars.owner_name, 'Gregory and Andrea Hansen')
  assert.equal(vars.offense, '2nd Offense')
  assert.equal(vars.deadline, '09/29/26')
  assert.equal(vars.fine, '$50.00')
  assert.equal(vars.hoa_name, 'Reserves at Park Creek')
})

test('noticeReadiness: manual action needs nothing; email inputs only when the owner has an email', () => {
  process.env.GOOGLE_DRIVE_FOLDER_ID = 'folder'
  assert.deepEqual(noticeReadiness({ event: { event_type: 'MANUAL_ACTION' }, rule: {}, settings: {}, ownerEmail: 'a@x.com' }), [])
  const ready = { ...SAMPLE.settings, notice_email_subject: 'S', notice_email_body: 'B' }
  assert.deepEqual(noticeReadiness({ event: SAMPLE.event, rule: SAMPLE.rule, settings: ready, ownerEmail: 'a@x.com' }), [])
  assert.deepEqual(noticeReadiness({ event: SAMPLE.event, rule: SAMPLE.rule, settings: SAMPLE.settings, ownerEmail: '' }), [])
  const missing = noticeReadiness({ event: SAMPLE.event, rule: SAMPLE.rule, settings: SAMPLE.settings, ownerEmail: 'a@x.com' })
  assert.deepEqual(missing, ['HOA_SETTINGS.notice_email_subject', 'HOA_SETTINGS.notice_email_body'])
  delete process.env.GOOGLE_DRIVE_FOLDER_ID
  assert.ok(noticeReadiness({ event: SAMPLE.event, rule: SAMPLE.rule, settings: ready, ownerEmail: '' }).some(m => m.startsWith('GOOGLE_DRIVE_FOLDER_ID')))
})
