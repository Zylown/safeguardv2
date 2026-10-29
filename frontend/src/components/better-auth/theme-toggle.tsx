'use client';

import { useLayoutEffect, useState } from 'react';

type Theme = 'light' | 'dark';

function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('light');

  useLayoutEffect(() => {
    const stored = localStorage.getItem('safeguard-theme');
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const initial: Theme =
      stored === 'light' || stored === 'dark' ? stored : media.matches ? 'dark' : 'light';
    applyTheme(initial);
    setTheme(initial);

    function syncSystemTheme(event: MediaQueryListEvent) {
      if (!localStorage.getItem('safeguard-theme')) {
        const next = event.matches ? 'dark' : 'light';
        applyTheme(next);
        setTheme(next);
      }
    }

    media.addEventListener('change', syncSystemTheme);
    return () => media.removeEventListener('change', syncSystemTheme);
  }, []);

  function toggleTheme() {
    const next: Theme = theme === 'light' ? 'dark' : 'light';
    localStorage.setItem('safeguard-theme', next);
    applyTheme(next);
    setTheme(next);
  }

  return (
    <button
      aria-label={`Cambiar a tema ${theme === 'light' ? 'oscuro' : 'claro'}`}
      className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-sm font-medium text-ink transition hover:bg-surface-muted"
      onClick={toggleTheme}
      type="button"
    >
      <span aria-hidden="true">{theme === 'light' ? '◐' : '☼'}</span>
      <span className="hidden sm:inline">{theme === 'light' ? 'Tema oscuro' : 'Tema claro'}</span>
    </button>
  );
}
