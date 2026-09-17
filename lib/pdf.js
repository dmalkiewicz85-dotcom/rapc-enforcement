// Two-page notice PDF (spec, TWO-PAGE PDF). The supplied template is a
// scanned image with no form fields, so this is the "faithful overlay /
// reproduction" path: same wording, order, and layout as
// docs/templates/TEMPLATE - IRM Violation Notice.pdf, with the bracketed
// placeholders replaced by the letter model from lib/letter.js. Nothing in
// the body text is composed here; only placeholder values change.
//
// Page 1: the violation notice.  Page 2: the Violation Response Form,
// prefilled with name / association / address / phone / email / date.

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

const PAGE = { w: 612, h: 792 }             // US Letter, points
const M = { left: 54, right: 54, top: 60 }  // margins
const TEXT_W = PAGE.w - M.left - M.right
const BLACK = rgb(0, 0, 0)
const NAVY = rgb(0.17, 0.27, 0.49)

// Wraps a string to lines that fit `width` at `size` in `font`.
export function wrap(text, font, size, width) {
  const lines = []
  for (const para of String(text ?? '').split(/\r?\n/)) {
    const words = para.split(/\s+/).filter(Boolean)
    if (!words.length) { lines.push(''); continue }
    let line = ''
    for (const w of words) {
      const next = line ? `${line} ${w}` : w
      if (font.widthOfTextAtSize(next, size) <= width) line = next
      else { lines.push(line); line = w }
    }
    lines.push(line)
  }
  return lines
}

// A cursor that writes top-down on one page.
function writer(page, fonts) {
  let y = PAGE.h - M.top
  const api = {
    get y() { return y },
    set y(v) { y = v },
    gap(n = 1, size = 11) { y -= n * size * 1.15 },
    line(text, { font = fonts.regular, size = 11, x = M.left, color = BLACK } = {}) {
      page.drawText(text, { x, y, size, font, color })
      y -= size * 1.15
    },
    center(text, { font = fonts.regular, size = 11, color = BLACK } = {}) {
      const w = font.widthOfTextAtSize(text, size)
      page.drawText(text, { x: (PAGE.w - w) / 2, y, size, font, color })
      y -= size * 1.15
    },
    para(text, { font = fonts.regular, size = 11, width = TEXT_W, x = M.left, color = BLACK } = {}) {
      for (const l of wrap(text, font, size, width)) api.line(l, { font, size, x, color })
    },
    // Runs of [text, font] on one wrapped paragraph (bold lead-ins, etc.).
    runs(runs, { size = 11, width = TEXT_W, x = M.left } = {}) {
      let cx = x
      const space = fonts.regular.widthOfTextAtSize(' ', size)
      for (const [text, font = fonts.regular] of runs) {
        for (const word of String(text).split(/(\s+)/)) {
          if (!word) continue
          if (/^\s+$/.test(word)) { cx += space; continue }
          const w = font.widthOfTextAtSize(word, size)
          if (cx + w > x + width) { y -= size * 1.15; cx = x }
          page.drawText(word, { x: cx, y, size, font, color: BLACK })
          cx += w
        }
      }
      y -= size * 1.15
    },
    rule(color = BLACK, thickness = 1) {
      page.drawLine({ start: { x: M.left, y }, end: { x: PAGE.w - M.right, y }, thickness, color })
    },
  }
  return api
}

function checkbox(page, x, y, checked, size = 9) {
  page.drawRectangle({ x, y: y - 1, width: size, height: size, borderColor: BLACK, borderWidth: 0.8 })
  if (checked) {
    page.drawLine({ start: { x: x + 1.5, y: y + 0.5 }, end: { x: x + size - 1.5, y: y + size - 2.5 }, thickness: 1, color: BLACK })
    page.drawLine({ start: { x: x + 1.5, y: y + size - 2.5 }, end: { x: x + size - 1.5, y: y + 0.5 }, thickness: 1, color: BLACK })
  }
}

/**
 * @param {object} model   from buildLetterModel()
 * @param {object} [assets] { logoPng?: Uint8Array, signaturePng?: Uint8Array }
 * @returns {Promise<Uint8Array>}
 */
export async function renderNoticePdf(model, assets = {}) {
  const doc = await PDFDocument.create()
  doc.setTitle(`${model.hoaDisplayName} — Violation Notice ${model.caseNumber}`)
  doc.setAuthor(model.managementCompany)
  const fonts = {
    regular: await doc.embedFont(StandardFonts.TimesRoman),
    bold: await doc.embedFont(StandardFonts.TimesRomanBold),
    italic: await doc.embedFont(StandardFonts.TimesRomanItalic),
    boldItalic: await doc.embedFont(StandardFonts.TimesRomanBoldItalic),
    sans: await doc.embedFont(StandardFonts.Helvetica),
    sansBold: await doc.embedFont(StandardFonts.HelveticaBold),
  }
  const logo = assets.logoPng ? await doc.embedPng(assets.logoPng) : null
  const signature = assets.signaturePng ? await doc.embedPng(assets.signaturePng) : null

  await page1(doc, fonts, model, signature)
  await page2(doc, fonts, model, logo)
  return doc.save()
}

async function page1(doc, fonts, m, signature) {
  const page = doc.addPage([PAGE.w, PAGE.h])
  const w = writer(page, fonts)

  w.center(m.clientLegalName, { size: 14 })
  w.gap(1.5)
  w.line(m.noticeDateLong)
  w.gap(2)

  // Address block. [InCareOf] and [LotNumber] are not in the roster: omitted.
  w.line([m.recipient, m.inCareOf].filter(Boolean).join(' '))
  w.line(m.mailing.address1)
  w.line(`${m.mailing.city}${m.mailing.city ? ',' : ''} ${m.mailing.state} ${m.mailing.zip}`.replace(/\s+/g, ' ').trim())
  w.gap(2)
  w.line(`Unit No: ${[m.lotNumber, m.unitAddress].filter(Boolean).join(' - ')}`)
  w.gap(1)
  w.line(`Dear ${m.recipient},`)
  w.gap(1)

  w.para('It has come to our attention that an individual residing in your unit may be in violation of the Governing Documents. This is a friendly reminder that your unit is subject to certain restrictions. Please be advised that future notices will be sent in the form of official violations, which may result in fines that increase with recurrence.')
  w.gap(1)

  // [ViolationActionRequired]
  for (const line of m.actionRequired) w.para(line, { font: fonts.bold })
  w.gap(1)

  w.runs([
    ['Condominium Document Provisions Violated: ', fonts.bold],
    ['Your actions or inactions described above violate the provisions of the Governing Documents, as follows: '],
    [m.ccrCode, fonts.bold],
  ])
  w.gap(1)
  w.para(m.ccrText, { font: fonts.italic })
  w.gap(1)

  w.para('The enclosed violation response form provides you with the opportunity to communicate compliance, dispute the violation or request a hearing with the Board of Directors. If no response is received, a hearing will be held at the next meeting of the Board where your nonattendance will constitute in a default hearing.')
  w.gap(1)
  w.para(`We appreciate your anticipated cooperation in rectifying the issue above. Within 14 days, please email ${m.managerEmail} and let us know whether the issue has been addressed, that you have a plan to address it or that you dispute the violation. Please be advised that after violation closure, there may be a 12-month monitored period in which another offense regarding this type of violation will result in the violation being reopened and automatically progressed to the next step in the violation process.`)
  w.gap(1)
  w.para(`Any discussion of this violation must be done in writing through ${m.managerEmail}.`, { font: fonts.bold })
  w.gap(1)
  w.para('It is the responsibility of the landlord to inform and resolve any violations with their tenant.', { font: fonts.bold })
  w.gap(1.5)

  // Signature block (left) and fine box (right), as in the template.
  const boxTop = w.y + 4
  w.line('Sincerely,')
  w.line(m.managementCompany)
  w.line(`Agent for ${m.clientLegalName}`)
  if (signature) {
    const h = 28, sw = signature.width * (h / signature.height)
    page.drawImage(signature, { x: M.left, y: w.y - h + 10, width: sw, height: h })
    w.y -= h
  } else {
    w.gap(2)
  }
  w.gap(0.5)
  w.line(m.managerName)
  w.line('Community Manager')
  w.line(m.clientLegalName)

  // Fine box: the template's four options plus, if the configured fine is
  // not one of them, the actual amount on its own checked line.
  const options = ['Courtesy Letter', '$25 Fine', '$50 Fine', '$100 Fine']
  const rows = options.includes(m.fineLabel) ? options : [...options, m.fineLabel]
  const bx = PAGE.w - M.right - 150, bw = 150, rowH = 16
  const bh = rows.length * rowH + 12
  page.drawRectangle({ x: bx, y: boxTop - bh, width: bw, height: bh, borderColor: BLACK, borderWidth: 1 })
  rows.forEach((label, i) => {
    const y = boxTop - 14 - i * rowH
    checkbox(page, bx + 8, y, label === m.fineLabel)
    page.drawText(label, { x: bx + 22, y, size: 11, font: fonts.regular, color: BLACK })
  })
}

async function page2(doc, fonts, m, logo) {
  const page = doc.addPage([PAGE.w, PAGE.h])
  const w = writer(page, fonts)

  // Letterhead: logo (if the Board has uploaded one) and the management
  // company line, then the rule.
  let top = PAGE.h - 40
  if (logo) {
    const h = 60, lw = logo.width * (h / logo.height)
    page.drawImage(logo, { x: M.left, y: top - h, width: lw, height: h })
    top -= h + 6
  } else {
    top -= 20
  }
  page.drawLine({ start: { x: M.left, y: top }, end: { x: PAGE.w - M.right, y: top }, thickness: 1.5, color: NAVY })
  w.y = top - 16
  w.center(`${m.managementCompany} • ${m.managementAddress}`, { font: fonts.sans, size: 11, color: NAVY })
  w.gap(1.5)

  // Boxed title.
  const th = 34
  page.drawRectangle({ x: M.left, y: w.y - th + 10, width: TEXT_W, height: th, borderColor: BLACK, borderWidth: 2.5 })
  w.y -= 12
  const title = 'Violation Response Form'
  const tw = fonts.bold.widthOfTextAtSize(title, 16)
  page.drawText(title, { x: (PAGE.w - tw) / 2, y: w.y, size: 16, font: fonts.bold, color: BLACK })
  page.drawLine({ start: { x: (PAGE.w - tw) / 2, y: w.y - 2 }, end: { x: (PAGE.w + tw) / 2, y: w.y - 2 }, thickness: 1, color: BLACK })
  w.y -= 40

  // Prefilled fields on underlines.
  const field = (label, value, x, width, y) => {
    page.drawText(label, { x, y, size: 12, font: fonts.regular, color: BLACK })
    const lx = x + fonts.regular.widthOfTextAtSize(label, 12) + 6
    page.drawLine({ start: { x: lx, y: y - 2 }, end: { x: x + width, y: y - 2 }, thickness: 0.8, color: BLACK })
    if (value) page.drawText(String(value), { x: lx + 3, y: y + 1, size: 11, font: fonts.sans, color: BLACK })
  }
  const f = m.responseForm
  field('Name:', f.name, M.left, 300, w.y)
  field('Date:', f.date, M.left + 310, TEXT_W - 310, w.y)
  w.y -= 30
  field('Association Name:', f.associationName, M.left, TEXT_W, w.y); w.y -= 30
  field('Property Address:', f.propertyAddress, M.left, TEXT_W, w.y); w.y -= 30
  field('Phone:', f.phone, M.left, 190, w.y)
  field('Email:', f.email, M.left + 200, TEXT_W - 200, w.y)
  w.y -= 24
  w.rule(BLACK, 1.5)
  w.y -= 26

  // Response options with blank lines for the homeowner.
  const option = (text, lines) => {
    page.drawRectangle({ x: M.left, y: w.y - 6, width: 20, height: 20, borderColor: BLACK, borderWidth: 1.5 })
    page.drawText(text, { x: M.left + 34, y: w.y, size: 12, font: fonts.regular, color: BLACK })
    w.y -= 26
    for (let i = 0; i < lines; i++) {
      page.drawLine({ start: { x: M.left + 34, y: w.y }, end: { x: PAGE.w - M.right, y: w.y }, thickness: 0.6, color: BLACK })
      w.y -= 16
    }
    w.y -= 14
  }
  option('I have met compliance by taking the following action:', 4)
  option('I am not in violation of the Association’s rules and regulations because:', 4)
  option('I am requesting a hearing with the Board of Directors to discuss the violation I received.', 0)
  w.y -= 6
  field('Co-owner Signature:', '', M.left, 360, w.y)
  w.y -= 34
  w.center('***Please note that failure to respond may constitute in a default hearing***', { font: fonts.bold, size: 11 })
  w.gap(1.5)
  w.para(`Please return the completed form to the office of ${m.managementCompany}, ${m.managementAddress} or ${m.managerEmail}.`, { size: 11 })

  // Footer rule (the template's accreditation tagline is company-specific
  // and only printed when the Board configures one).
  page.drawLine({ start: { x: M.left, y: 60 }, end: { x: PAGE.w - M.right, y: 60 }, thickness: 1, color: NAVY })
  if (m.managementTagline) {
    const tg = fonts.sansBold.widthOfTextAtSize(m.managementTagline, 11)
    page.drawText(m.managementTagline, { x: (PAGE.w - tg) / 2, y: 44, size: 11, font: fonts.sansBold, color: NAVY })
  }
}
