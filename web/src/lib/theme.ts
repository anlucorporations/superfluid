// Utilidades de tema (Design System v1.1 — claro con toggle a oscuro persistido).
export const THEME_KEY = 'sf-theme';
export type Theme = 'light' | 'dark';

/** Instrucciones del script inline anti-FOUC (se ejecuta antes de hidratar). */
export const themeInitScript = (key = THEME_KEY) => `try{var t=localStorage.getItem(${JSON.stringify(key)});if(t!=='dark'&&t!=='light'){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme='light'}`;

export function getStoredTheme(): Theme | null {
  if (typeof window === 'undefined') return null;
  try {
    const t = window.localStorage.getItem(THEME_KEY);
    return t === 'dark' || t === 'light' ? t : null;
  } catch {
    return null;
  }
}

export function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch { /* modo privado: sin persistencia */ }
}
