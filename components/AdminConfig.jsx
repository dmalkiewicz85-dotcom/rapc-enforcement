'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle } from 'lucide-react'

const NEEDS = 'NEEDS_BOARD_INPUT'
const ROLE_LABEL = { BOARD_ADMIN: 'Board Administrator', BOARD_MEMBER: 'Board Member', ARC_MEMBER: 'ARC Member', PROPERTY_MANAGEMENT: 'Property Management' }

// Shared save helper: PATCH/POST, surface the error, refresh server data.
function useSave() {
  const router = useRouter()
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)
  async function save(key, url, method, body) {
    setBusy(key); setError(null)
    try {
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      router.refresh()
      return true
    } catch (e) { setError(`${key}: ${e.message}`); return false } finally { setBusy(null) }
  }
  return { save, busy, error }
}

// ---------------------------------------------------------------- Settings
export function SettingsEditor({ settings, hints, missing }) {
  const { save, busy, error } = useSave()
  return (
    <section className="card space-y-3">
      <h2 className="text-lg font-semibold">HOA settings</h2>
      {missing.length > 0 && (
        <p className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>Notices cannot be generated until these are set: {missing.map(m => m.replace('HOA_SETTINGS.', '')).join(', ')}.</span>
        </p>
      )}
      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="divide-y divide-ink-200">
        {settings.map(s => <SettingRow key={s.key} s={s} hint={hints[s.key]} busy={busy === s.key} onSave={v => save(s.key, '/api/admin/settings', 'PATCH', { key: s.key, value: v })} />)}
      </div>
    </section>
  )
}

function SettingRow({ s, hint, busy, onSave }) {
  const [v, setV] = useState(s.value ?? '')
  const long = /body|address|text/.test(s.key)
  const dirty = v !== (s.value ?? '')
  const needs = s.value === NEEDS
  return (
    <div className="grid gap-2 py-3 sm:grid-cols-[220px_1fr_auto] sm:items-start">
      <div>
        <div className={`font-mono text-sm ${needs ? 'text-amber-800 font-semibold' : ''}`}>{s.key}</div>
        {hint && <div className="text-xs text-ink-500">{hint}</div>}
      </div>
      {long
        ? <textarea className="input" rows={3} value={v} onChange={e => setV(e.target.value)} />
        : <input className="input" value={v} onChange={e => setV(e.target.value)} />}
      <button className="btn-secondary py-1" disabled={!dirty || busy} onClick={() => onSave(v)}>{busy ? 'Saving…' : 'Save'}</button>
    </div>
  )
}

// ---------------------------------------------------------------- Rules
const RULE_TEXT = [
  ['governing_document', 'Governing document'], ['governing_section', 'Section'],
  ['governing_text', 'Governing text (printed in the notice)'], ['corrective_action_text', 'Corrective action (printed in the notice)'],
]
const STEP_COLS = [
  ['action_name', 'Action', 'text'], ['fine_amount', 'Fine $', 'number'], ['deadline_days', 'Days', 'number'],
  ['is_final_warning', 'Final', 'yn'], ['is_recurring', 'Recurring', 'yn'], ['recurrence_days', 'Every (days)', 'number'],
  ['requires_board_approval', 'Approval', 'yn'], ['manual_action_required', 'Manual', 'yn'],
]

export function RulesEditor({ rules }) {
  const { save, busy, error } = useSave()
  const [open, setOpen] = useState(null)
  return (
    <section className="card space-y-3">
      <h2 className="text-lg font-semibold">Violation rules and enforcement steps</h2>
      <p className="text-sm text-ink-600">Fines, deadlines, and letter text live here, not in code. Every change is audited. Placeholders marked NEEDS_BOARD_INPUT block notice generation for that rule.</p>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <ul className="divide-y divide-ink-200">
        {rules.map(r => (
          <li key={r.id} className="py-3">
            <button className="flex w-full flex-wrap items-center justify-between gap-2 text-left" onClick={() => setOpen(open === r.id ? null : r.id)}>
              <span className="font-semibold">{r.name} <span className="font-normal text-ink-500">· {r.id} · {r.active === 'Y' ? 'active' : 'inactive'}</span></span>
              <span className="text-xs">
                {r.missingLetterInputs.length > 0
                  ? <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-900">{r.missingLetterInputs.length} letter input(s) needed</span>
                  : <span className="rounded bg-green-100 px-2 py-0.5 text-green-900">letter ready</span>}
                <span className="ml-2 text-ink-500">{open === r.id ? '▲' : '▼'}</span>
              </span>
            </button>
            {open === r.id && <RuleDetail r={r} busy={busy} save={save} />}
          </li>
        ))}
      </ul>
    </section>
  )
}

function RuleDetail({ r, busy, save }) {
  const [f, setF] = useState(() => Object.fromEntries([...RULE_TEXT.map(([k]) => k), 'default_deadline_days', 'offense_window_days', 'reset_on_compliance', 'active', 'initiating_authority'].map(k => [k, r[k] ?? ''])))
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  const dirty = Object.keys(f).some(k => String(f[k]) !== String(r[k] ?? ''))
  return (
    <div className="mt-3 space-y-4 rounded-md border border-ink-200 bg-ink-50 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {RULE_TEXT.map(([k, label]) => (
          <label key={k} className={k.includes('text') ? 'sm:col-span-2' : ''}>
            <span className="label">{label}</span>
            {k.includes('text')
              ? <textarea className={`input ${f[k] === NEEDS ? 'border-amber-400' : ''}`} rows={3} value={f[k]} onChange={e => set(k, e.target.value)} />
              : <input className={`input ${f[k] === NEEDS ? 'border-amber-400' : ''}`} value={f[k]} onChange={e => set(k, e.target.value)} />}
          </label>
        ))}
        <label><span className="label">Initiating authority</span><input className="input" value={f.initiating_authority} onChange={e => set('initiating_authority', e.target.value)} /></label>
        <label><span className="label">Default deadline days</span><input type="number" min="0" className="input" value={f.default_deadline_days} onChange={e => set('default_deadline_days', e.target.value)} /></label>
        <label><span className="label">Offense window days</span><input type="number" min="0" className="input" value={f.offense_window_days} onChange={e => set('offense_window_days', e.target.value)} /></label>
        <div className="flex items-end gap-6">
          <YN label="Reset on compliance" v={f.reset_on_compliance} onChange={v => set('reset_on_compliance', v)} />
          <YN label="Active" v={f.active} onChange={v => set('active', v)} />
        </div>
      </div>
      <button className="btn-primary" disabled={!dirty || busy === r.id} onClick={() => save(r.id, `/api/admin/rules/${r.id}`, 'PATCH', f)}>{busy === r.id ? 'Saving…' : 'Save rule'}</button>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-ink-500">
            <tr><th className="px-2 py-1">Step</th>{STEP_COLS.map(([k, l]) => <th key={k} className="px-2 py-1">{l}</th>)}<th></th></tr>
          </thead>
          <tbody>
            {r.steps.map(s => <StepRow key={s.id} s={s} busy={busy === s.id} save={save} />)}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function StepRow({ s, busy, save }) {
  const [f, setF] = useState(() => Object.fromEntries(STEP_COLS.map(([k]) => [k, s[k] ?? ''])))
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  const dirty = STEP_COLS.some(([k]) => String(f[k]) !== String(s[k] ?? ''))
  return (
    <tr className="border-t border-ink-200">
      <td className="px-2 py-1 font-semibold">{s.step_number}</td>
      {STEP_COLS.map(([k, , type]) => (
        <td key={k} className="px-2 py-1">
          {type === 'yn'
            ? <input type="checkbox" checked={f[k] === 'Y'} onChange={e => set(k, e.target.checked ? 'Y' : 'N')} />
            : <input type={type} min="0" className={`input py-1 ${type === 'number' ? 'w-20' : 'w-44'}`} value={f[k]} onChange={e => set(k, e.target.value)} />}
        </td>
      ))}
      <td className="px-2 py-1"><button className="btn-secondary py-1 text-xs" disabled={!dirty || busy} onClick={() => save(s.id, `/api/admin/steps/${s.id}`, 'PATCH', f)}>{busy ? '…' : 'Save'}</button></td>
    </tr>
  )
}

function YN({ label, v, onChange }) {
  return <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v === 'Y'} onChange={e => onChange(e.target.checked ? 'Y' : 'N')} /> {label}</label>
}

// ---------------------------------------------------------------- Users
export function UsersEditor({ users, me }) {
  const { save, busy, error } = useSave()
  const [n, setN] = useState({ name: '', email: '', role: 'BOARD_MEMBER' })
  return (
    <section className="card space-y-3">
      <h2 className="text-lg font-semibold">Users</h2>
      <p className="text-sm text-ink-600">Until Google sign-in is wired, users pick themselves from the &ldquo;Acting as&rdquo; menu. Email must match their Google account at go-live.</p>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase text-ink-500"><tr><th className="px-2 py-1">Name</th><th className="px-2 py-1">Email</th><th className="px-2 py-1">Role</th><th className="px-2 py-1">Active</th><th></th></tr></thead>
        <tbody>
          {users.map(u => <UserRow key={u.id} u={u} me={me} busy={busy === u.id} save={save} />)}
          <tr className="border-t border-ink-200">
            <td className="px-2 py-2"><input className="input py-1" placeholder="New user name" value={n.name} onChange={e => setN({ ...n, name: e.target.value })} /></td>
            <td className="px-2 py-2"><input className="input py-1" placeholder="email" value={n.email} onChange={e => setN({ ...n, email: e.target.value })} /></td>
            <td className="px-2 py-2"><RoleSelect v={n.role} onChange={v => setN({ ...n, role: v })} /></td>
            <td className="px-2 py-2 text-ink-500">Y</td>
            <td className="px-2 py-2"><button className="btn-primary py-1 text-xs" disabled={!n.name.trim() || busy === 'new'}
              onClick={async () => { if (await save('new', '/api/admin/users', 'POST', n)) setN({ name: '', email: '', role: 'BOARD_MEMBER' }) }}>Add</button></td>
          </tr>
        </tbody>
      </table>
    </section>
  )
}

function UserRow({ u, me, busy, save }) {
  const [f, setF] = useState({ name: u.name, email: u.email, role: u.role, active: u.active })
  const dirty = ['name', 'email', 'role', 'active'].some(k => f[k] !== u[k])
  return (
    <tr className="border-t border-ink-200">
      <td className="px-2 py-1"><input className="input py-1" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></td>
      <td className="px-2 py-1"><input className="input py-1" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /></td>
      <td className="px-2 py-1"><RoleSelect v={f.role} onChange={v => setF({ ...f, role: v })} /></td>
      <td className="px-2 py-1"><input type="checkbox" checked={f.active === 'Y'} disabled={u.id === me} onChange={e => setF({ ...f, active: e.target.checked ? 'Y' : 'N' })} /></td>
      <td className="px-2 py-1"><button className="btn-secondary py-1 text-xs" disabled={!dirty || busy} onClick={() => save(u.id, '/api/admin/users', 'POST', { id: u.id, ...f })}>{busy ? '…' : 'Save'}</button></td>
    </tr>
  )
}

function RoleSelect({ v, onChange }) {
  return (
    <select className="input py-1" value={v} onChange={e => onChange(e.target.value)}>
      {Object.entries(ROLE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
    </select>
  )
}
