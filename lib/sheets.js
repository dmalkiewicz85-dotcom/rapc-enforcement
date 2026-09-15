// Google Sheets as the system of record. Rows travel as plain objects keyed by
// the header titles in lib/schema.js; column position is resolved at request
// time so the Board can reorder columns in the sheet without breaking the app.
//
// Sheets has no transactions. Multi-tab writes go through writeSteps() so a
// mid-sequence failure reports which steps already landed instead of a bare
// 500 — the caller reconciles rather than guesses. Same pattern as GLMC.
//
// Every row is identified by its `id` column (HOA_SETTINGS uses `key`). Row
// updates locate the row by id at write time, never by a remembered index,
// because someone sorting the sheet would otherwise corrupt the next write.

import { sheetsApi } from './google.js'
import { TABS } from './schema.js'

const SHEET_ID = () => process.env.GOOGLE_SHEETS_ID

// Sheets values.get returns ragged arrays — trailing empty cells are dropped —
// so pad every row to the header length.
function toObjects(headers, rows) {
  return rows.map((r, i) => {
    const o = { _row: i + 2 } // 1-based, header is row 1
    headers.forEach((h, j) => { o[h] = r[j] ?? '' })
    return o
  })
}

async function withRetry(fn, tries = 3) {
  let last
  for (let i = 0; i < tries; i++) {
    try { return await fn() } catch (e) {
      last = e
      const code = e?.code ?? e?.response?.status
      if (![429, 500, 502, 503].includes(Number(code))) throw e
      await new Promise(r => setTimeout(r, 500 * 2 ** i))
    }
  }
  throw last
}

export async function readTab(tab) {
  if (!TABS[tab]) throw new Error(`Unknown tab ${tab}`)
  const res = await withRetry(() => sheetsApi().spreadsheets.values.get({
    spreadsheetId: SHEET_ID(), range: `${tab}!A:ZZ`, valueRenderOption: 'UNFORMATTED_VALUE',
    dateTimeRenderOption: 'FORMATTED_STRING',
  }))
  const [headers = [], ...rows] = res.data.values ?? []
  assertHeaders(tab, headers)
  return toObjects(headers.map(String), rows).filter(r => r[headers[0]] !== '')
}

export async function readTabs(...tabs) {
  const res = await withRetry(() => sheetsApi().spreadsheets.values.batchGet({
    spreadsheetId: SHEET_ID(), ranges: tabs.map(t => `${t}!A:ZZ`),
    valueRenderOption: 'UNFORMATTED_VALUE', dateTimeRenderOption: 'FORMATTED_STRING',
  }))
  const out = {}
  res.data.valueRanges.forEach((vr, i) => {
    const tab = tabs[i]
    const [headers = [], ...rows] = vr.values ?? []
    assertHeaders(tab, headers)
    out[tab] = toObjects(headers.map(String), rows).filter(r => r[headers[0]] !== '')
  })
  return out
}

function assertHeaders(tab, headers) {
  const expected = TABS[tab]
  const missing = expected.filter(h => !headers.includes(h))
  if (missing.length) {
    throw new Error(`Tab ${tab} is missing columns: ${missing.join(', ')}. Run npm run sheets:init.`)
  }
}

function serialize(tab, obj, headers = TABS[tab]) {
  return headers.map(h => {
    const v = obj[h]
    if (v == null) return ''
    if (typeof v === 'boolean') return v ? 'Y' : 'N'
    return v
  })
}

export async function appendRows(tab, objs) {
  if (!objs.length) return []
  await withRetry(() => sheetsApi().spreadsheets.values.append({
    spreadsheetId: SHEET_ID(), range: `${tab}!A1`, valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: objs.map(o => serialize(tab, o)) },
  }))
  return objs
}

export const appendRow = (tab, obj) => appendRows(tab, [obj]).then(r => r[0])

// Patch by id. Re-reads the tab to find the row, then writes only the
// patched cells, so concurrent edits to other columns are not clobbered.
export async function updateRow(tab, id, patch) {
  const idCol = TABS[tab][0]
  const rows = await readTab(tab)
  const row = rows.find(r => String(r[idCol]) === String(id))
  if (!row) throw new Error(`${tab} row ${id} not found`)
  const headers = TABS[tab]
  const data = Object.entries(patch)
    .filter(([k]) => headers.includes(k))
    .map(([k, v]) => ({
      range: `${tab}!${colLetter(headers.indexOf(k))}${row._row}`,
      values: [[v == null ? '' : typeof v === 'boolean' ? (v ? 'Y' : 'N') : v]],
    }))
  if (!data.length) return row
  await withRetry(() => sheetsApi().spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET_ID(), requestBody: { valueInputOption: 'RAW', data },
  }))
  return { ...row, ...patch }
}

export function colLetter(i) {
  let s = ''
  for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + (n % 26)) + s
  return s
}

// Runs named steps in order. On failure, throws an error carrying the list of
// steps that already completed so the API can report a partial write honestly.
export async function writeSteps(steps) {
  const done = []
  const results = {}
  for (const [name, fn] of steps) {
    try {
      results[name] = await fn(results)
      done.push(name)
    } catch (e) {
      const err = new Error(`Failed at step "${name}": ${e.message}`)
      err.completedSteps = done
      err.failedStep = name
      err.cause = e
      throw err
    }
  }
  return results
}

// HOA_SETTINGS is key/value; expose it as one object.
export async function readSettings() {
  const rows = await readTab('HOA_SETTINGS')
  return Object.fromEntries(rows.map(r => [r.key, r.value]))
}
