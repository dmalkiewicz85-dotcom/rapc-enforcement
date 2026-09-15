// One OAuth client, acting as the HOA account (rapchoa@gmail.com), shared by
// Sheets, Drive, and Gmail. Server-only: reads process.env and must never be
// imported from a client component.

import { google } from 'googleapis'

export const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/gmail.send',
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
]

export function googleConfigStatus() {
  const missing = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN', 'GOOGLE_SHEETS_ID']
    .filter(k => !process.env[k])
  return { configured: missing.length === 0, missing }
}

let cached
export function authClient() {
  if (cached) return cached
  const { configured, missing } = googleConfigStatus()
  if (!configured) throw new Error(`Google not configured — missing ${missing.join(', ')}. See docs/SETUP_GOOGLE.md.`)
  const client = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
  client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
  cached = client
  return client
}

export const sheetsApi = () => google.sheets({ version: 'v4', auth: authClient() })
export const driveApi  = () => google.drive({ version: 'v3', auth: authClient() })
export const gmailApi  = () => google.gmail({ version: 'v1', auth: authClient() })
