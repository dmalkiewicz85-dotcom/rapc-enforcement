// Google Drive: notices are filed in the configured folder as PDFs, and the
// optional logo / signature PNGs are read back by file id. Server-only.

import { Readable } from 'node:stream'
import { driveApi } from './google.js'

const FOLDER = () => process.env.GOOGLE_DRIVE_FOLDER_ID

export function driveConfigured() {
  return Boolean(FOLDER())
}

// Returns { id, webViewLink }.
export async function uploadPdf(name, bytes) {
  if (!FOLDER()) throw new Error('GOOGLE_DRIVE_FOLDER_ID is not set')
  const res = await driveApi().files.create({
    requestBody: { name, parents: [FOLDER()], mimeType: 'application/pdf' },
    media: { mimeType: 'application/pdf', body: Readable.from(Buffer.from(bytes)) },
    fields: 'id, webViewLink',
  })
  return res.data
}

export async function downloadFile(fileId) {
  const res = await driveApi().files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' })
  return new Uint8Array(res.data)
}

// Best-effort: a missing or unreadable image never blocks a notice.
export async function tryDownload(fileId) {
  if (!fileId) return null
  try { return await downloadFile(fileId) } catch { return null }
}
