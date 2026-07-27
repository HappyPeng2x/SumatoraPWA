const STORAGE_KEY = 'sumatora:theme'

export interface ThemeOption {
  id: string
  label: string
  /** accent-500 / accent-600, used to paint the picker swatch itself */
  swatch: [string, string]
}

// Keep in sync with the [data-theme="..."] blocks in index.css.
export const THEMES: ThemeOption[] = [
  { id: 'tora', label: 'Tora', swatch: ['#ef3b2e', '#d51d10'] },
  { id: 'indigo', label: 'Indigo', swatch: ['#6366f1', '#4f46e5'] },
  { id: 'jade', label: 'Jade', swatch: ['#51cda3', '#34b288'] },
  { id: 'sakura', label: 'Sakura', swatch: ['#cd517a', '#b2345e'] },
]

const DEFAULT_THEME = 'tora'
const VALID_IDS = new Set(THEMES.map((t) => t.id))

export function getStoredTheme(): string {
  const stored = localStorage.getItem(STORAGE_KEY)
  return stored && VALID_IDS.has(stored) ? stored : DEFAULT_THEME
}

export function applyTheme(id: string): void {
  document.documentElement.dataset.theme = VALID_IDS.has(id) ? id : DEFAULT_THEME
  localStorage.setItem(STORAGE_KEY, id)
}
