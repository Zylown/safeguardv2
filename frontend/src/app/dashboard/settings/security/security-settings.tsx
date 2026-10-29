'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getBetterAuthClient } from '@/lib/better-auth-client';
import { ThemeToggle } from '@/components/better-auth/theme-toggle';

export function SecuritySettings({ schemaReady }: { schemaReady: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<'checking' | 'enabled' | 'disabled' | 'error'>('checking');

  useEffect(() => {
    let active = true;
    void getBetterAuthClient()
      .getSession()
      .then((result) => {
        if (!active) return;
        if (result.error || !result.data?.session) {
          router.replace('/login');
          return;
        }
        setState(result.data.user.twoFactorEnabled ? 'enabled' : 'disabled');
      })
      .catch(() => {
        if (active) setState('error');
      });
    return () => {
      active = false;
    };
  }, [router]);

  return (
    <main className="min-h-screen bg-canvas px-5 py-6 text-ink sm:px-8">
      <header className="mx-auto flex max-w-3xl items-center justify-between">
        <a href="/dashboard" className="font-semibold">
          SafeGuard · CRM
        </a>
        <ThemeToggle />
      </header>
      <section className="mx-auto mt-12 max-w-3xl rounded-3xl border border-line bg-surface p-7 sm:p-10">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand">Ajustes</p>
        <h1 className="mt-2 text-2xl font-semibold">Seguridad de la cuenta</h1>
        <h2 className="mt-7 font-semibold">Authenticator (TOTP)</h2>
        {state === 'checking' ? (
          <p className="mt-2 text-sm text-ink-muted">Comprobando configuración…</p>
        ) : null}
        {state === 'error' ? (
          <p role="alert" className="mt-2 text-sm text-danger">
            No se pudo comprobar la sesión.
          </p>
        ) : null}
        {state === 'enabled' ? (
          <p role="status" className="mt-2 text-sm text-ink-muted">
            Authenticator está activo. Los próximos inicios de sesión requerirán el segundo factor.
          </p>
        ) : null}
        {state === 'disabled' && !schemaReady ? (
          <p className="mt-2 text-sm text-ink-muted">
            La configuración estará disponible cuando se apruebe y aplique la migración de
            seguridad.
          </p>
        ) : null}
        {state === 'disabled' && schemaReady ? (
          <div className="mt-3">
            <p className="text-sm text-ink-muted">
              La activación es voluntaria. Después de activarla, los nuevos inicios de sesión
              exigirán un código TOTP.
            </p>
            <a
              className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-brand px-4 font-semibold text-white dark:text-slate-950"
              href="/login/better-auth/two-factor/setup"
            >
              Configurar Authenticator
            </a>
          </div>
        ) : null}
      </section>
    </main>
  );
}
