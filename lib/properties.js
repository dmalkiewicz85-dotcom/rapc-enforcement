// Property list and detail, joined in memory from one batchGet.

import { readTabs } from './sheets.js'
import { normalizeAddress } from './ids.js'

function joinProperties(d) {
  const owners = new Map(d.OWNERS.map(o => [o.id, o]))
  const ownershipsByProp = new Map()
  for (const o of d.PROPERTY_OWNERSHIP) {
    if (!ownershipsByProp.has(o.property_id)) ownershipsByProp.set(o.property_id, [])
    ownershipsByProp.get(o.property_id).push({ ...o, owner: owners.get(o.owner_id) ?? null })
  }
  const violationsByProp = new Map()
  for (const v of d.VIOLATIONS) {
    if (!violationsByProp.has(v.property_id)) violationsByProp.set(v.property_id, [])
    violationsByProp.get(v.property_id).push(v)
  }
  const rules = new Map(d.VIOLATION_RULES.map(r => [r.id, r]))

  return d.PROPERTIES.map(p => {
    const history = (ownershipsByProp.get(p.id) ?? []).sort((a, b) => String(b.start_date).localeCompare(String(a.start_date)))
    const current = history.find(o => o.active === 'Y' && !o.end_date) ?? null
    const violations = (violationsByProp.get(p.id) ?? [])
      .map(v => ({ ...v, rule_name: rules.get(v.rule_id)?.name ?? v.rule_id }))
      .sort((a, b) => String(b.date_observed).localeCompare(String(a.date_observed)))
    return {
      ...p,
      owner: current?.owner ?? null,
      ownership: current,
      ownershipHistory: history,
      violations,
      openCount: violations.filter(v => v.status === 'OPEN').length,
    }
  }).sort((a, b) => a.property_address.localeCompare(b.property_address, 'en', { numeric: true }))
}

const TABS = ['PROPERTIES', 'OWNERS', 'PROPERTY_OWNERSHIP', 'VIOLATIONS', 'VIOLATION_RULES']

export async function loadProperties(q = '') {
  const all = joinProperties(await readTabs(...TABS))
  const needle = normalizeAddress(q)
  const nameNeedle = q.trim().toLowerCase()
  if (!needle) return all
  return all.filter(p =>
    p.address_normalized.includes(needle) || (p.owner?.name ?? '').toLowerCase().includes(nameNeedle),
  )
}

export async function loadProperty(id) {
  return joinProperties(await readTabs(...TABS)).find(p => p.id === id) ?? null
}
