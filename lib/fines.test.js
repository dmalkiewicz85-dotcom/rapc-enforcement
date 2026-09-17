import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as XLSX from 'xlsx'
import { joinFines, buildPmReportRows, pmReportXlsx, pmReportCsv, reportable } from './fines.js'

const data = () => ({
  FINES: [
    { id: 'F1', violation_id: 'V1', enforcement_event_id: 'E3', amount: 50, status: 'BOARD_APPROVED', approved_at: '2026-09-10T15:00:00.000Z', approved_by: 'U1', include_in_pm_report: 'Y' },
    { id: 'F2', violation_id: 'V1', enforcement_event_id: 'E4', amount: 100, status: 'READY_FOR_PM', approved_at: '2026-10-10T15:00:00.000Z', approved_by: 'U1', include_in_pm_report: 'N' },
    { id: 'F3', violation_id: 'V1', enforcement_event_id: 'E4', amount: 100, status: 'SENT_TO_PM', approved_at: '2026-08-10T15:00:00.000Z', approved_by: 'U9', include_in_pm_report: 'Y' },
  ],
  VIOLATIONS: [{ id: 'V1', case_number: 'VIO-2026-0001', property_id: 'P1', rule_id: 'RULE-008', date_observed: '2026-09-01', owner_name_snapshot: 'Hansen', owner_email_snapshot: 'a@x.com' }],
  ENFORCEMENT_EVENTS: [{ id: 'E3', step_number: 3, action_name: 'Fine' }, { id: 'E4', step_number: 4, action_name: 'Recurring Fine' }],
  PROPERTIES: [{ id: 'P1', property_address: '3482 Park Creek Lane' }],
  VIOLATION_RULES: [{ id: 'RULE-008', name: 'Vehicular Parking / Storage' }],
  USERS: [{ id: 'U1', name: 'Leslie' }],
})

test('joinFines joins case, property, rule, approver; newest first; flags pending PM', () => {
  const f = joinFines(data())
  assert.deepEqual(f.map(x => x.id), ['F2', 'F1', 'F3'])
  assert.equal(f[1].property.property_address, '3482 Park Creek Lane')
  assert.equal(f[1].approvedByName, 'Leslie')
  assert.equal(f[2].approvedByName, 'U9')
  assert.deepEqual(f.map(x => x.pendingPm), [true, true, false])
})

test('reportable = pending PM and ticked', () => {
  assert.deepEqual(reportable(joinFines(data())).map(f => f.id), ['F1'])
})

test('report rows use the spec columns, and export to xlsx and csv', () => {
  const rows = buildPmReportRows(reportable(joinFines(data())))
  assert.deepEqual(Object.keys(rows[0]).slice(0, 10), [
    'Property Address', 'Owner Name', 'Owner Email', 'Violation Type', 'Violation Date',
    'Enforcement Level', 'Fine Amount', 'Fine Date', 'Board Approval Date', 'Approved By',
  ])
  assert.equal(rows[0]['Fine Amount'], 50)
  assert.equal(rows[0]['Enforcement Level'], 'Step 3 — Fine')
  assert.equal(rows[0]['Fine Date'], '09/10/26')

  const wb = XLSX.read(pmReportXlsx(rows), { type: 'buffer' })
  const back = XLSX.utils.sheet_to_json(wb.Sheets.Fines)
  assert.equal(back.length, 1)
  assert.equal(back[0]['Owner Name'], 'Hansen')
  assert.match(pmReportCsv(rows), /^Property Address,Owner Name/)
})
