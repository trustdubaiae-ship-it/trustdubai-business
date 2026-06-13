// tritova-business/src/lib/theme.js
// Light/Dark theme helper — sets data-theme on <html>, remembers choice in localStorage.

const KEY = 'td_theme'

export function getTheme() {
  try { return localStorage.getItem(KEY) || 'light' } catch { return 'light' }
}

export function applyTheme(theme) {
  const t = theme === 'dark' ? 'dark' : 'light'
  if (t === 'dark') document.documentElement.setAttribute('data-theme', 'dark')
  else              document.documentElement.removeAttribute('data-theme')
  try { localStorage.setItem(KEY, t) } catch {}
  return t
}

export function toggleTheme() {
  const next = getTheme() === 'dark' ? 'light' : 'dark'
  return applyTheme(next)
}

// call once on app start so saved choice is restored
export function initTheme() {
  applyTheme(getTheme())
}
