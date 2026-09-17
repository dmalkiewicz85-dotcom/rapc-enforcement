import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { buildLetterModel, missingLetterInputs, longDate } from './letter.js'
import { renderNoticePdf, wrap } from './pdf.js'
import { SAMPLE } from './letter-sample.js'
import { HOA_SETTINGS, RULES, NEEDS_INPUT } from './seed.js'

test('refuses to build while required settings or rule text are NEEDS_BOARD_INPUT', () => {
  const seededRule = RULES.find(r => r.id === 'RULE-008')
  const missing = missingLetterInputs({ rule: seededRule, settings: HOA_SETTINGS })
  assert.ok(missing.includes('HOA_SETTINGS.hoa_legal_name'))
  assert.ok(missing.includes('HOA_SETTINGS.manager_email'))
  assert.ok(missing.includes('VIOLATION_RULES.RULE-008.governing_text'))
  assert.ok(missing.includes('VIOLATION_RULES.RULE-008.corrective_action_text'))
  assert.throws(() => buildLetterModel({ ...SAMPLE, rule: { ...SAMPLE.rule, governing_text: NEEDS_INPUT }, noticeDate: '2026-09-17' }), /Board provides: VIOLATION_RULES.RULE-008.governing_text/)
  assert.throws(() => buildLetterModel({ ...SAMPLE, settings: { ...SAMPLE.settings, manager_email: '' }, noticeDate: '2026-09-17' }), /manager_email/)
})

test('model fills every template placeholder from case, rule, and settings — nothing invented', () => {
  const m = buildLetterModel({ ...SAMPLE, noticeDate: '2026-09-17' })
  assert.equal(m.clientLegalName, SAMPLE.settings.hoa_legal_name)
  assert.equal(m.recipient, 'Gregory and Andrea Hansen')
  assert.deepEqual(m.mailing, { address1: '3482 Park Creek Lane', city: 'Canton', state: 'MI', zip: '48188' })
  assert.equal(m.inCareOf, '')       // not in the roster
  assert.equal(m.lotNumber, '')      // not in the roster
  assert.equal(m.unitAddress, '3482 Park Creek Lane')
  assert.equal(m.ccrCode, '[Governing Document — SAMPLE], [Section — SAMPLE]')
  assert.equal(m.ccrText, SAMPLE.rule.governing_text)
  assert.equal(m.managerEmail, 'manager@example.com')
  assert.equal(m.noticeDateLong, 'September 17, 2026')
  assert.equal(m.templateType, 'FINAL_WARNING')
  assert.equal(m.fineLabel, 'Courtesy Letter')
  assert.match(m.actionRequired[0], /2nd Offense \(Final Warning\)/)
  assert.match(m.actionRequired[1], /Observed 09\/15\/26: Boat trailer/)
  assert.match(m.actionRequired[2], /^Action required: \[SAMPLE corrective action/)
  assert.match(m.actionRequired[3], /Compliance deadline: 09\/29\/26/)
  assert.equal(m.actionRequired.length, 4) // no fine line on a $0 notice
  assert.equal(m.responseForm.email, 'sample@example.com')
  assert.equal(m.responseForm.phone, '(555) 555-0100')
})

test('fine notices: label matches the template box or shows the configured amount', () => {
  const at = fine => buildLetterModel({ ...SAMPLE, event: { ...SAMPLE.event, fine_amount: fine, event_type: 'FINE' }, noticeDate: '2026-09-17' })
  assert.equal(at(50).fineLabel, '$50 Fine')
  assert.equal(at(75).fineLabel, '$75 Fine')
  assert.match(at(75).actionRequired.at(-1), /Fine assessed: \$75\.00/)
  assert.equal(at(50).templateType, 'STANDARD_WARNING')
})

test('mailing falls back to parsing the snapshot when no owner row is supplied', () => {
  const m = buildLetterModel({ ...SAMPLE, owner: undefined, noticeDate: '2026-09-17' })
  assert.deepEqual(m.mailing, { address1: '3482 Park Creek Lane', city: 'Canton', state: 'MI', zip: '48188' })
  assert.equal(m.responseForm.phone, '')
})

test('longDate and wrap', async () => {
  assert.equal(longDate('2026-01-05'), 'January 5, 2026')
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.TimesRoman)
  const lines = wrap('one two three four five six seven eight nine ten', font, 12, 100)
  assert.ok(lines.length > 1)
  assert.ok(lines.every(l => font.widthOfTextAtSize(l, 12) <= 100))
  assert.deepEqual(wrap('a\n\nb', font, 12, 100), ['a', '', 'b'])
})

test('renders a two-page PDF', async () => {
  const bytes = await renderNoticePdf(buildLetterModel({ ...SAMPLE, noticeDate: '2026-09-17' }))
  assert.ok(bytes.length > 3000)
  const doc = await PDFDocument.load(bytes)
  assert.equal(doc.getPageCount(), 2)
})
