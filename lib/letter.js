// Letter content engine (spec, LETTER CONTENT ENGINE / WARNING LETTER
// GENERATION). Pure: assembles every field the notice PDF needs from the
// case, the approved event, the rule configuration, the owner snapshot, and
// HOA_SETTINGS. It never invents language — governing-document references,
// governing text, corrective-action text, manager and management-company
// details all come from the sheet, and buildLetterModel() refuses to build
// while any required one is still NEEDS_BOARD_INPUT.
//
// Template placeholders (docs/templates/TEMPLATE - IRM Violation Notice.pdf):
//   [ClientLegalName] [Recipient] [InCareOf] [MailingAddress1] [MailingCity]
//   [MailingState] [MailingZip] [LotNumber] [UnitAddress1]
//   [ViolationActionRequired] [CCRCode] [CCRText] [ManagerEmail]
//   [ManagerSignature] [ManagerName]
// The roster has no Lot Number or In Care Of, so those render as nothing
// (spec: do not output empty placeholders).

import { NEEDS_INPUT } from './seed.js'
import { formatDate, toDateISO } from './time.js'

const isSet = v => v != null && String(v).trim() !== '' && String(v).trim() !== NEEDS_INPUT

// Settings keys the letter cannot render without.
export const REQUIRED_SETTINGS = [
  'hoa_legal_name', 'management_company_name', 'management_company_address', 'manager_name', 'manager_email',
]
// Rule columns the letter cannot render without.
export const REQUIRED_RULE_TEXT = ['governing_document', 'governing_section', 'governing_text', 'corrective_action_text']

// Returns the list of missing inputs (empty when the letter can be built).
export function missingLetterInputs({ rule, settings }) {
  const missing = []
  for (const k of REQUIRED_SETTINGS) if (!isSet(settings?.[k])) missing.push(`HOA_SETTINGS.${k}`)
  for (const k of REQUIRED_RULE_TEXT) if (!isSet(rule?.[k])) missing.push(`VIOLATION_RULES.${rule?.id ?? '?'}.${k}`)
  return missing
}

function splitMailing(snapshot, owner) {
  // Prefer the structured owner row; fall back to the "addr, city ST zip" snapshot.
  if (owner?.mailing_address) {
    return { address1: owner.mailing_address, city: owner.mailing_city ?? '', state: owner.mailing_state ?? '', zip: owner.mailing_zip ?? '' }
  }
  const [address1 = '', rest = ''] = String(snapshot ?? '').split(/,\s*/, 2)
  const m = rest.match(/^(.*?)\s+([A-Z]{2})\s*(\d{5}(?:-\d{4})?)?$/)
  return m
    ? { address1, city: m[1], state: m[2], zip: m[3] ?? '' }
    : { address1, city: rest, state: '', zip: '' }
}

const money = n => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
const ordinal = n => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]) }

/**
 * @param {object} p
 * @param {object} p.violation   VIOLATIONS row (owner_*_snapshot are used)
 * @param {object} p.event       the APPROVED ENFORCEMENT_EVENTS row
 * @param {object} p.rule        VIOLATION_RULES row
 * @param {object} p.property    PROPERTIES row
 * @param {object} p.settings    HOA_SETTINGS as an object
 * @param {object} [p.owner]     OWNERS row at time of generation, for structured mailing fields
 * @param {string} p.noticeDate  YYYY-MM-DD
 */
export function buildLetterModel({ violation, event, rule, property, settings, owner, noticeDate }) {
  const missing = missingLetterInputs({ rule, settings })
  if (missing.length) {
    const err = new Error(`Cannot generate the notice until the Board provides: ${missing.join(', ')}`)
    err.missing = missing
    throw err
  }
  const fine = Number(event.fine_amount) || 0
  const deadline = violation.actual_deadline || violation.default_deadline || ''
  const offense = Number(violation.offense_number) || Number(event.step_number) || 1
  const mailing = splitMailing(violation.owner_mailing_snapshot, owner)
  const templateType = event.event_type === 'FINAL_WARNING' ? 'FINAL_WARNING' : 'STANDARD_WARNING'

  // [ViolationActionRequired]: what was observed, what the rule requires,
  // by when, and the fine — all from the case and the configured rule.
  const actionRequired = [
    `Violation: ${rule.name} — ${ordinal(offense)} Offense${event.action_name ? ` (${event.action_name})` : ''}.`,
    `Observed ${formatDate(violation.date_observed)}: ${String(violation.description ?? '').trim()}`,
    `Action required: ${String(rule.corrective_action_text).trim()}`,
    deadline ? `Compliance deadline: ${formatDate(deadline)}.` : null,
    fine > 0 ? `Fine assessed: ${money(fine)}.` : null,
  ].filter(Boolean)

  return {
    templateType,
    noticeDate: toDateISO(noticeDate),
    noticeDateLong: longDate(noticeDate),
    clientLegalName: settings.hoa_legal_name,
    hoaDisplayName: settings.hoa_display_name || settings.hoa_legal_name,
    recipient: violation.owner_name_snapshot,
    inCareOf: '',
    lotNumber: '',
    mailing,
    unitAddress: property.property_address,
    actionRequired,
    ccrCode: `${rule.governing_document}, ${rule.governing_section}`.trim(),
    ccrText: String(rule.governing_text).trim(),
    managerEmail: settings.manager_email,
    managerName: settings.manager_name,
    managementCompany: settings.management_company_name,
    managementAddress: settings.management_company_address,
    managementTagline: isSet(settings.management_company_tagline) ? settings.management_company_tagline : '',
    fine,
    fineLabel: fine > 0 ? `${money(fine).replace(/\.00$/, '')} Fine` : 'Courtesy Letter',
    offense,
    caseNumber: violation.case_number,
    deadline,
    // Page 2, Violation Response Form prefill.
    responseForm: {
      name: violation.owner_name_snapshot,
      date: longDate(noticeDate),
      associationName: settings.hoa_legal_name,
      propertyAddress: property.property_address,
      phone: owner?.phone ?? '',
      email: violation.owner_email_snapshot ?? '',
    },
  }
}

export function longDate(iso) {
  const [y, m, d] = toDateISO(iso).split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}
