// Creates every tab from lib/schema.js in the configured spreadsheet, writes
// the header row, freezes it, and seeds configuration into empty tabs.
//
//   npm run sheets:init
//
// Safe to rerun: existing tabs are left alone (their headers are verified and
// the script stops if they disagree with the schema), and seed data is only
// written into a tab that has no data rows. The Board's edits to rules and
// settings are never overwritten.

import 'dotenv/config'
import { sheetsApi } from '../lib/google.js'
import { TABS } from '../lib/schema.js'
import { RULES, RULE_STEPS, USERS, HOA_SETTINGS } from '../lib/seed.js'
import { nowISO } from '../lib/time.js'

const spreadsheetId = process.env.GOOGLE_SHEETS_ID
if (!spreadsheetId) { console.error('GOOGLE_SHEETS_ID not set.'); process.exit(1) }

const api = sheetsApi()
const meta = await api.spreadsheets.get({ spreadsheetId })
const existing = new Map(meta.data.sheets.map(s => [s.properties.title, s.properties]))
console.log(`Spreadsheet: ${meta.data.properties.title}`)

// 1. Create missing tabs.
const toCreate = Object.keys(TABS).filter(t => !existing.has(t))
if (toCreate.length) {
  const res = await api.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: toCreate.map(title => ({
        addSheet: { properties: { title, gridProperties: { frozenRowCount: 1 } } },
      })),
    },
  })
  res.data.replies.forEach(r => existing.set(r.addSheet.properties.title, r.addSheet.properties))
  console.log(`Created tabs: ${toCreate.join(', ')}`)
}

// 2. Headers: write into new tabs, verify existing ones.
const headerReads = await api.spreadsheets.values.batchGet({
  spreadsheetId, ranges: Object.keys(TABS).map(t => `${t}!1:1`),
})
const headerWrites = []
let bad = false
Object.keys(TABS).forEach((tab, i) => {
  const current = headerReads.data.valueRanges[i].values?.[0] ?? []
  if (!current.length) {
    headerWrites.push({ range: `${tab}!A1`, values: [TABS[tab]] })
  } else {
    const missing = TABS[tab].filter(h => !current.includes(h))
    if (missing.length) { bad = true; console.error(`Tab ${tab} is missing columns: ${missing.join(', ')}`) }
  }
})
if (bad) { console.error('Fix the headers above (or add the columns) and rerun.'); process.exit(1) }
if (headerWrites.length) {
  await api.spreadsheets.values.batchUpdate({
    spreadsheetId, requestBody: { valueInputOption: 'RAW', data: headerWrites },
  })
  // Bold + freeze the header row on new tabs.
  await api.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: headerWrites.map(w => {
        const tab = w.range.split('!')[0]
        const sheetId = existing.get(tab).sheetId
        return {
          repeatCell: {
            range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
            cell: { userEnteredFormat: { textFormat: { bold: true } } },
            fields: 'userEnteredFormat.textFormat.bold',
          },
        }
      }),
    },
  })
  console.log(`Wrote headers: ${headerWrites.map(w => w.range.split('!')[0]).join(', ')}`)
}

// 3. Seed empty configuration tabs.
const now = nowISO()
const seeds = {
  VIOLATION_RULES: RULES.map(({ steps: _s, ...r }) => r),
  RULE_ENFORCEMENT_STEPS: RULE_STEPS,
  USERS: USERS.map(u => ({ ...u, created_at: now })),
  HOA_SETTINGS: Object.entries(HOA_SETTINGS).map(([key, value]) => ({ key, value, updated_at: now, updated_by: 'seed' })),
}
const dataReads = await api.spreadsheets.values.batchGet({
  spreadsheetId, ranges: Object.keys(seeds).map(t => `${t}!A2:A`),
})
for (const [i, tab] of Object.keys(seeds).entries()) {
  const hasRows = (dataReads.data.valueRanges[i].values ?? []).length > 0
  if (hasRows) { console.log(`${tab}: has data, seed skipped`); continue }
  const values = seeds[tab].map(o => TABS[tab].map(h => o[h] ?? ''))
  await api.spreadsheets.values.append({
    spreadsheetId, range: `${tab}!A1`, valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS',
    requestBody: { values },
  })
  console.log(`${tab}: seeded ${values.length} rows`)
}

// 4. Drop the default empty "Sheet1" if it is still there and unused.
const sheet1 = existing.get('Sheet1')
if (sheet1 && !TABS.Sheet1) {
  const r = await api.spreadsheets.values.get({ spreadsheetId, range: 'Sheet1!A1:B2' })
  if (!r.data.values) {
    await api.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [{ deleteSheet: { sheetId: sheet1.sheetId } }] } })
    console.log('Removed empty Sheet1')
  }
}

console.log('Done.')
