'use client';
// Átomo ThemeToggle — Design System v1.1. Botón icono con estados de foco visibles
// y área táctica ≥44×44. aria-label descriptivo; sin texto redundante en pantalla.

import { useEffect, useState } from 'react';
import { applyTheme, getStoredTheme, type Theme } from '@/lib/theme';

function Sun() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}
function Moon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
    </svg>
  );
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    const stored = getStoredTheme();
    const current = (typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark') ? 'dark' : 'light';
    setTheme(stored ?? current);
  }, []);

  const flip = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    applyTheme(next);
  };

  return (
    <button
      type="button"
      onClick={flip}
      aria-label={theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
      className="inline-flex h-11 w-11 items-center justify-center rounded-pill border border-line-strong bg-raised text-ink-2 shadow-card transition-colors duration-150 hover:border-brand hover:text-brand"
    >
      {theme === 'dark' ? <Sun /> : <Moon />}
    </button>
  );
}
