'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { getBetterAuthClient } from '@/lib/better-auth-client';
import { ThemeToggle } from '@/components/better-auth/theme-toggle';

export function TwoFactorChallenge() {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setPending(true);
    const data = new FormData(event.currentTarget);
    const code = String(data.get('code') ?? '').replace(/\s/g, '');
    if (recoveryMode ? code.length < 8 || code.length > 64 : !/^\d{6}$/.test(code)) {
      setError(
        recoveryMode
          ? 'Ingresa un código de recuperación válido.'
          : 'Ingresa el código de seis dígitos de tu Authenticator.',
      );
      setPending(false);
      return;
    }

    try {
      const auth = getBetterAuthClient();
      const result = recoveryMode
        ? await auth.twoFactor.verifyBackupCode({ code })
        : await auth.twoFactor.verifyTotp({ code });
      if (result.error) {
        setError('El código no es válido o expiró. Inténtalo nuevamente.');
        return;
      }
      router.replace('/dashboard');
      router.refresh();
    } catch {
      setError('No se pudo verificar el código. Inténtalo nuevamente.');
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="min-h-screen bg-canvas px-4 py-8 text-ink sm:px-6 sm:py-12">
      <div className="mx-auto max-w-md">
        <header className="flex items-center justify-between">
          <a className="text-lg font-semibold" href="/">
            SafeGuard
          </a>
          <ThemeToggle />
        </header>
        <section className="mt-14 rounded-3xl border border-line bg-surface p-7 shadow-sm sm:p-9">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand">Segundo factor</p>
          <h1 className="mt-2 text-2xl font-semibold">Verifica tu identidad</h1>
          <p className="mt-3 text-sm leading-6 text-ink-muted">
            {recoveryMode
              ? 'Ingresa uno de tus códigos de recuperación. El código se invalida al usarlo.'
              : 'Ingresa el código actual de seis dígitos de tu aplicación Authenticator.'}
          </p>
          <form className="mt-7 space-y-5" onSubmit={submit}>
            <label className="block text-sm font-medium" htmlFor="totp-code">
              Código
            </label>
            <input
              autoComplete={recoveryMode ? 'off' : 'one-time-code'}
              className="min-h-12 w-full rounded-xl border border-line bg-canvas px-4 text-center font-mono text-xl tracking-[0.35em] text-ink"
              id="totp-code"
              inputMode={recoveryMode ? 'text' : 'numeric'}
              maxLength={recoveryMode ? 64 : 6}
              name="code"
              pattern={recoveryMode ? undefined : '[0-9]{6}'}
              required
            />
            {error ? (
              <p className="text-sm text-danger" role="alert">
                {error}
              </p>
            ) : null}
            <button
              className="min-h-12 w-full rounded-xl bg-brand px-4 font-semibold text-white disabled:opacity-60 dark:text-slate-950"
              disabled={pending}
            >
              {pending
                ? 'Verificando…'
                : recoveryMode
                  ? 'Usar código de recuperación'
                  : 'Verificar código'}
            </button>
            <button
              className="w-full text-sm font-medium text-brand underline"
              disabled={pending}
              onClick={() => {
                setRecoveryMode((mode) => !mode);
                setError(undefined);
              }}
              type="button"
            >
              {recoveryMode ? 'Usar Authenticator' : 'Usar código de recuperación'}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
