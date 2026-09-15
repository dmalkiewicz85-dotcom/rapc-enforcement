// Timestamps are stored as ISO-8601 UTC; dates as YYYY-MM-DD. Users see
// America/Detroit (spec, TIMEZONE).

export const TIMEZONE = 'America/Detroit'

export const nowISO = () => new Date().toISOString()

// Today's calendar date in Detroit, not UTC — a violation logged at 10pm
// Eastern must not be dated tomorrow.
export function todayISO(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}

// Accepts YYYY-MM-DD or a full ISO timestamp; returns YYYY-MM-DD in Detroit.
export function toDateISO(v) {
  if (!v) return v
  const s = String(v)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  return todayISO(new Date(s))
}

// Calendar arithmetic on YYYY-MM-DD, immune to DST because it never touches hours.
export function addDays(dateISO, days) {
  const [y, m, d] = toDateISO(dateISO).split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  return dt.toISOString().slice(0, 10)
}

export function formatDate(v) {
  if (!v) return ''
  const s = toDateISO(v)
  const [y, m, d] = s.split('-')
  return `${m}/${d}/${y.slice(2)}`
}

export function formatDateTime(iso) {
  if (!iso) return ''
  return new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE, month: '2-digit', day: '2-digit', year: '2-digit',
    hour: 'numeric', minute: '2-digit',
  }).format(new Date(iso))
}
