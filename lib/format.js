export function ordinal(n) {
  if (!n) return ''
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

export const money = n => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
