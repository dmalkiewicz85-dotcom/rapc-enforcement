// Every tab in the Google Sheet and its exact header row, in column order.
//
// This is the API contract with the spreadsheet: rows are read and written by
// header title, so renaming a header here without migrating the sheet (or vice
// versa) silently drops that field. `npm run sheets:init` creates any tab that
// is missing and refuses to run if an existing tab's headers disagree.
//
// Mirrors the DATABASE TABLES section of the spec, plus HOA_SETTINGS and APPEALS.
// Every tab's first column is `id`; timestamps are ISO-8601 UTC (see lib/time.js).

export const TABS = {
  PROPERTIES: [
    'id', 'property_address', 'address_normalized', 'active', 'created_at', 'updated_at',
  ],
  OWNERS: [
    'id', 'name', 'email', 'mailing_address', 'mailing_city', 'mailing_state', 'mailing_zip',
    'phone', 'created_at',
  ],
  PROPERTY_OWNERSHIP: [
    'id', 'property_id', 'owner_id', 'start_date', 'end_date', 'active',
  ],
  USERS: [
    'id', 'name', 'email', 'role', 'active', 'created_at',
  ],
  VIOLATION_RULES: [
    'id', 'name', 'active', 'initiating_authority', 'governing_document', 'governing_section',
    'governing_text', 'corrective_action_text', 'default_deadline_days', 'offense_window_days',
    'reset_on_compliance', 'notes',
  ],
  RULE_ENFORCEMENT_STEPS: [
    'id', 'rule_id', 'step_number', 'action_name', 'fine_amount', 'deadline_days',
    'is_final_warning', 'is_fine', 'is_recurring', 'recurrence_days', 'requires_board_approval',
    'manual_action_required', 'template_type', 'notes',
  ],
  VIOLATIONS: [
    'id', 'case_number', 'property_id', 'ownership_id', 'owner_id', 'rule_id', 'date_observed',
    'description', 'internal_notes', 'status', 'offense_number', 'default_deadline',
    'actual_deadline', 'deadline_overridden', 'deadline_override_reason', 'deadline_override_by',
    'deadline_override_at', 'compliance_status', 'compliance_date', 'compliance_verified_by',
    'compliance_notes', 'owner_name_snapshot', 'owner_email_snapshot',
    'owner_mailing_snapshot', 'created_by', 'created_at', 'closed_at',
  ],
  ENFORCEMENT_EVENTS: [
    'id', 'violation_id', 'step_number', 'event_type', 'action_name', 'fine_amount', 'status',
    'due_at', 'created_at', 'approved_at', 'approved_by', 'override', 'override_reason',
  ],
  NOTICES: [
    'id', 'violation_id', 'enforcement_event_id', 'template_type', 'generated_at', 'approved_at',
    'approved_by', 'sent_at', 'recipient_email', 'gmail_message_id', 'google_drive_file_id',
    'status', 'error',
  ],
  FINES: [
    'id', 'violation_id', 'enforcement_event_id', 'amount', 'status', 'approved_at', 'approved_by',
    'include_in_pm_report', 'sent_to_pm_at', 'pm_assessed_at', 'pm_reference', 'pm_notes',
  ],
  ATTACHMENTS: [
    'id', 'violation_id', 'file_name', 'file_type', 'google_drive_file_id', 'uploaded_by',
    'uploaded_at',
  ],
  APPEALS: [
    'id', 'violation_id', 'appeal_date', 'received_by', 'description', 'status',
    'board_decision', 'decision_date', 'created_at',
  ],
  AUDIT_LOG: [
    'id', 'user_id', 'user_name', 'entity_type', 'entity_id', 'action', 'old_value', 'new_value',
    'reason', 'created_at',
  ],
  HOA_SETTINGS: [
    'key', 'value', 'updated_at', 'updated_by',
  ],
}

// Enumerations. Stored as these exact strings.
export const ROLES = ['BOARD_ADMIN', 'BOARD_MEMBER', 'ARC_MEMBER', 'PROPERTY_MANAGEMENT']

export const CASE_STATUS = ['OPEN', 'CLOSED']
export const COMPLIANCE_STATUS = ['PENDING', 'COMPLIANT']

export const EVENT_STATUS = [
  'PENDING_BOARD_APPROVAL', 'APPROVED', 'REJECTED', 'CANCELLED',
]
export const EVENT_TYPE = ['WARNING', 'FINAL_WARNING', 'FINE', 'MANUAL_ACTION']

export const NOTICE_STATUS = [
  'GENERATED', 'SENT', 'EMAIL_FAILED', 'MANUAL_DELIVERY_REQUIRED',
]
export const TEMPLATE_TYPE = ['STANDARD_WARNING', 'FINAL_WARNING']

export const FINE_STATUS = [
  'PENDING_BOARD_APPROVAL', 'BOARD_APPROVED', 'READY_FOR_PM', 'SENT_TO_PM', 'ASSESSED',
  'WAIVED', 'DISPUTED',
]

export const APPEAL_STATUS = ['RECEIVED', 'UNDER_REVIEW', 'DECIDED']

// Permission matrix from the USER ROLES section. ARC fine approval is off by
// default; the Board can grant it in HOA_SETTINGS (arc_may_approve_fines=Y).
export const PERMISSIONS = {
  BOARD_ADMIN:         ['submit', 'review', 'approve_enforcement', 'approve_fines', 'override', 'mark_compliant', 'manage_users', 'import_roster', 'manage_rules', 'manage_settings', 'pm_reports', 'view_history'],
  BOARD_MEMBER:        ['submit', 'review', 'approve_enforcement', 'approve_fines', 'mark_compliant', 'pm_reports', 'view_history'],
  ARC_MEMBER:          ['submit', 'mark_compliant', 'view_history'],
  PROPERTY_MANAGEMENT: ['view_pm', 'pm_reports', 'update_pm_status'],
}

export function can(user, action, settings = {}) {
  if (!user) return false
  if (action === 'approve_fines' && user.role === 'ARC_MEMBER') {
    return settings.arc_may_approve_fines === 'Y'
  }
  return (PERMISSIONS[user.role] ?? []).includes(action)
}
