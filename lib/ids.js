// Generated identifiers — never hand-entered.
//
// Internal ids are opaque (prefix + random) so two people submitting at the
// same moment cannot collide on a "next number" read from the sheet. The one
// human-facing sequence, the case number VIO-YYYY-NNNN, is derived from
// existing rows at write time; a rare collision there is caught by the
// duplicate check and re-numbered, and it is never used as a join key.

import { randomBytes } from 'node:crypto'

export function newId(prefix) {
  return `${prefix}-${randomBytes(6).toString('hex').toUpperCase()}`
}

export function nextCaseNumber(existingCaseNumbers, year) {
  const prefix = `VIO-${year}-`
  const max = existingCaseNumbers
    .filter(n => typeof n === 'string' && n.startsWith(prefix))
    .reduce((m, n) => Math.max(m, parseInt(n.slice(prefix.length), 10) || 0), 0)
  return `${prefix}${String(max + 1).padStart(4, '0')}`
}

// Property Address is the unique property identifier (spec). Normalise so
// "514 Washtenaw", "514  washtenaw ", and "514 Washtenaw St." match on import.
export function normalizeAddress(s) {
  return String(s ?? '')
    .toUpperCase()
    .replace(/[.,#]/g, ' ')
    .replace(/\b(STREET|ST|DRIVE|DR|ROAD|RD|COURT|CT|LANE|LN|CIRCLE|CIR|AVENUE|AVE|BOULEVARD|BLVD|PLACE|PL|WAY|TRAIL|TRL)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
