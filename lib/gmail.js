// Gmail: sends as the HOA account. Builds the MIME message by hand (no extra
// dependency) and returns the Gmail message id for the NOTICES row.

import { gmailApi } from './google.js'

const b64url = buf => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const encodeHeader = s => /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`

// Recipients may be "a@x.com, b@y.com" (the roster keeps every co-owner email).
export function buildMime({ from, to, subject, text, attachments = [] }) {
  const boundary = `rapc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  const lines = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodeHeader(subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(text, 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n'),
  ]
  for (const a of attachments) {
    lines.push(
      `--${boundary}`,
      `Content-Type: ${a.mimeType}; name="${a.filename}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${a.filename}"`,
      '',
      Buffer.from(a.content).toString('base64').replace(/(.{76})/g, '$1\r\n'),
    )
  }
  lines.push(`--${boundary}--`, '')
  return lines.join('\r\n')
}

// Returns { id, threadId }.
export async function sendMail(msg) {
  const from = msg.from || process.env.HOA_ENFORCEMENT_EMAIL || 'me'
  const raw = b64url(buildMime({ ...msg, from }))
  const res = await gmailApi().users.messages.send({ userId: 'me', requestBody: { raw } })
  return res.data
}

// {placeholder} substitution for the configured subject/body.
export function fillTemplate(template, vars) {
  return String(template ?? '').replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k] ?? '') : m))
}
