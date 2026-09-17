// Seed configuration written by `npm run sheets:init` into an empty sheet.
//
// Fine amounts, deadlines, and steps are transcribed from the Rules Enforcement
// Guide as quoted in the spec (v1.0). Anything the spec did not state is left
// blank and listed in docs/TODO.md rather than guessed — in particular the
// governing-document references/text and corrective-action language (open
// items A–C), which the letter engine refuses to render while empty.
//
// After the first run the SHEET is the source of truth: the Board edits fines
// and deadlines there, and this file is never re-applied over their changes.

const NEEDS_INPUT = 'NEEDS_BOARD_INPUT'

// Helper so each step reads like the guide. Unset fields default to the safe
// value: no fine, not final, not recurring, Board approval required.
const step = (step_number, action_name, o = {}) => ({
  step_number,
  action_name,
  fine_amount: o.fine ?? 0,
  deadline_days: o.days ?? '',
  is_final_warning: o.final ? 'Y' : 'N',
  is_fine: (o.fine ?? 0) > 0 ? 'Y' : 'N',
  is_recurring: o.recurring ? 'Y' : 'N',
  recurrence_days: o.every ?? '',
  requires_board_approval: 'Y',
  manual_action_required: o.manual ? 'Y' : 'N',
  template_type: o.final ? 'FINAL_WARNING' : 'STANDARD_WARNING',
  notes: o.notes ?? '',
})

const rule = (id, name, o = {}) => ({
  id,
  name,
  active: 'Y',
  initiating_authority: o.authority ?? 'Board of Directors',
  governing_document: NEEDS_INPUT,
  governing_section: NEEDS_INPUT,
  governing_text: NEEDS_INPUT,
  corrective_action_text: NEEDS_INPUT,
  default_deadline_days: o.days ?? '',
  offense_window_days: o.window ?? '',
  reset_on_compliance: 'Y',
  notes: o.notes ?? '',
})

export const RULES = [
  {
    ...rule('RULE-001', 'Excessive Noise / Other Disturbances', {
      authority: 'Board of Directors / Canton Township Police',
      window: 365,
      notes: 'Guide specifies a 12-month offense window; Board directed reset_on_compliance=Y. '
        + 'Conflict left configurable per spec, not resolved in code. No compliance deadline stated in guide.',
    }),
    steps: [
      step(1, 'Written Warning'),
      step(2, 'Second Written Warning', { fine: 25 }),
      step(3, 'Third / Final Warning', { fine: 75, final: true }),
      step(4, 'Subsequent Offense Fine', { fine: 150, recurring: true, notes: 'Per occurrence. Publication provision applies (manual).' }),
    ],
  },
  {
    ...rule('RULE-002', 'Unkempt / Poorly Maintained Landscaping or House Exterior', { days: 30 }),
    steps: [
      step(1, 'Written Warning', { days: 30 }),
      step(2, 'Second Written Warning', { fine: 50, days: 30 }),
      step(3, 'Third / Final Notice', { final: true, manual: true, notes: 'Board may proceed with corrective action under By-Laws (contractor/legal). Expense recovery up to 105% — calculated manually, not by the app (v1).' }),
    ],
  },
  {
    ...rule('RULE-003', 'Trash Cans Stored in Violation', { days: 30 }),
    steps: [
      step(1, 'Written Notification'),
      step(2, 'Written Warning', { fine: 25, days: 30 }),
      step(3, 'Subsequent Offense Fine', { fine: 50, recurring: true, notes: '$50 per occurrence until compliance. Guide gives no interval — recurrence is per occurrence, triggered manually, until the Board sets recurrence_days.' }),
    ],
  },
  {
    ...rule('RULE-004', 'Recreational Structures', { days: 30 }),
    steps: [
      step(1, 'Written Notification', { days: 30 }),
      step(2, 'Second Written Warning', { fine: 50, days: 30 }),
      step(3, 'Contractor / Removal Process', { final: true, manual: true, notes: 'Potential recovery of 105% of contractor and Community Manager expenses — manual (v1).' }),
    ],
  },
  {
    ...rule('RULE-005', 'Holiday Decorations', { days: 7 }),
    steps: [
      step(1, 'Warning', { days: 7 }),
      step(2, 'Final Warning', { days: 7, final: true }),
      step(3, 'Fine', { fine: 25 }),
      step(4, 'Recurring Fine', { fine: 50, recurring: true, every: 30 }),
    ],
  },
  {
    ...rule('RULE-006', 'Political / Signs Inconsistent with HOA Rules', { days: 7 }),
    steps: [
      step(1, 'Warning', { days: 7 }),
      step(2, 'Final Warning', { days: 7, final: true }),
      step(3, 'Fine', { fine: 25 }),
      step(4, 'Recurring Fine', { fine: 50, recurring: true, every: 30 }),
    ],
  },
  {
    ...rule('RULE-007', 'Home Occupations / Nuisances / Livestock', { days: 14 }),
    steps: [
      step(1, 'Warning', { days: 14 }),
      step(2, 'Final Warning', { days: 14, final: true }),
      step(3, 'Fine', { fine: 25 }),
      step(4, 'Recurring Fine', { fine: 50, recurring: true, every: 30 }),
    ],
  },
  {
    ...rule('RULE-008', 'Vehicular Parking / Storage', { days: 7 }),
    steps: [
      step(1, 'Warning', { days: 7 }),
      step(2, 'Final Warning', { days: 7, final: true }),
      step(3, 'Fine', { fine: 50 }),
      step(4, 'Recurring Fine', { fine: 100, recurring: true, every: 30 }),
    ],
  },
  {
    ...rule('RULE-009', 'Landscaping Materials Stored More Than 30 Days', { days: 14 }),
    steps: [
      step(1, 'Warning', { days: 14 }),
      step(2, 'Final Warning', { days: 14, final: true }),
      step(3, 'Fine', { fine: 50 }),
      step(4, 'Recurring Fine', { fine: 100, recurring: true, every: 30 }),
    ],
  },
]

// Flattened for the RULE_ENFORCEMENT_STEPS tab.
export const RULE_STEPS = RULES.flatMap(r =>
  r.steps.map(s => ({ id: `${r.id}-S${s.step_number}`, rule_id: r.id, ...s })),
)

export const USERS = [
  { id: 'USER-001', name: 'Leslie Childress-Cooper', email: '', role: 'BOARD_ADMIN', active: 'Y' },
]

export const HOA_SETTINGS = {
  hoa_legal_name: NEEDS_INPUT,
  hoa_display_name: 'Reserves at Park Creek',
  enforcement_email: 'rapchoa@gmail.com',
  management_company_name: NEEDS_INPUT,
  management_company_address: NEEDS_INPUT,
  // Printed under the response form only if set (the template shows the
  // management company's accreditation line).
  management_company_tagline: '',
  manager_name: NEEDS_INPUT,
  manager_email: NEEDS_INPUT,
  manager_signature_drive_file_id: '',
  logo_drive_file_id: '',
  pm_report_recipient_email: NEEDS_INPUT,
  notice_email_subject: NEEDS_INPUT,
  notice_email_body: NEEDS_INPUT,
  // Roster import: the directory has no mailing columns, so the unit address is
  // the mailing address and these fill city/state/ZIP on every owner.
  property_city: 'Canton',
  property_state: 'MI',
  property_zip: NEEDS_INPUT,
  arc_may_approve_fines: 'N',
  timezone: 'America/Detroit',
}

export { NEEDS_INPUT }
