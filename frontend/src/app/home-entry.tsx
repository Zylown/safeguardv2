'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getBetterAuthClient } from '@/lib/better-auth-client';
import { ThemeToggle } from '@/components/better-auth/theme-toggle';
import { decideHomeEntry, signOutAndRedirect } from '@/lib/home-entry';

type EntryState = 'checking' | 'restricted' | 'error';

export function HomeEntry() {
  const router = useRouter();
  const [state, setState] = useState<EntryState>('checking');
  const [signOutError, setSignOutError] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let active = true;

    async function resolveEntry() {
      try {
        const session = await getBetterAuthClient().getSession();
        if (!active) return;

        const hasSession = Boolean(session.data?.session);
        const sessionDestination = decideHomeEntry(
          session.error ? 'failed' : hasSession ? 'active' : 'missing',
          'unchecked',
        );
        if (sessionDestination === 'login') {
          router.replace('/login');
          return;
        }
        if (sessionDestination === 'retry') {
          setState('error');
          return;
        }

        const response = await fetch('/api/backend/me', {
          cache: 'no-store',
          credentials: 'same-origin',
        });
        if (!active) return;

        const outcome =
          response.status === 401
            ? 'missing'
            : response.status === 403
              ? 'denied'
              : response.ok
                ? 'admin'
                : 'failed';
        const destination = decideHomeEntry('active', outcome);

        if (destination === 'login') {
          router.replace('/login');
          return;
        }
        if (destination === 'dashboard') {
          const body: unknown = await response.json();
          if (
            typeof body === 'object' &&
            body !== null &&
            'user' in body &&
            typeof body.user === 'object' &&
            body.user !== null &&
            'role' in body.user &&
            (body.user.role === 'ADMIN' || body.user.role === 'SUPER_ADMIN')
          ) {
            router.replace('/dashboard');
            return;
          }
          setState('restricted');
          return;
        }
        setState(destination === 'restricted' ? 'restricted' : 'error');
      } catch {
        if (active) setState('error');
      }
    }

    void resolveEntry();
    return () => {
      active = false;
    };
  }, [router]);

  async function signOut() {
    setSigningOut(true);
    setSignOutError(false);
    const signedOut = await signOutAndRedirect(
      () => getBetterAuthClient().signOut(),
      () => {
        router.replace('/login');
        router.refresh();
      },
    );
    if (!signedOut) {
      setSignOutError(true);
      setSigningOut(false);
    }
  }

  function retry() {
    window.location.reload();
  }

  return (
    <main className="min-h-screen bg-canvas px-5 py-6 text-ink sm:px-8">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between">
        <a aria-label="SafeGuard, inicio" className="flex items-center gap-3" href="/">
          <span className="grid size-11 place-items-center rounded-xl bg-brand text-lg font-bold text-white dark:text-slate-950">
            S
          </span>
          <span className="text-lg font-semibold tracking-tight">SafeGuard</span>
        </a>
        <ThemeToggle />
      </header>

      <section
        aria-live="polite"
        className="mx-auto mt-16 w-full max-w-xl rounded-3xl border border-line bg-surface p-7 shadow-sm sm:mt-24 sm:p-10"
      >
        {state === 'checking' ? (
          <div className="py-4" role="status">
            <span className="grid size-12 place-items-center rounded-2xl bg-accent text-xl font-semibold text-brand-strong dark:text-brand">
              S
            </span>
            <p className="mt-6 text-xs font-bold uppercase tracking-[0.16em] text-brand">
              Espacio privado
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              Comprobando tu acceso
            </h1>
            <p className="mt-3 text-sm leading-6 text-ink-muted">
              SafeGuard validará la sesión y los permisos con el servicio interno antes de mostrar
              el panel.
            </p>
            <span
              aria-hidden="true"
              className="mt-7 block h-1.5 w-full overflow-hidden rounded-full bg-surface-muted"
            >
              <span className="block h-full w-1/3 animate-pulse rounded-full bg-brand" />
            </span>
          </div>
        ) : null}

        {state === 'restricted' ? (
          <div className="py-3">
            <span
              aria-hidden="true"
              className="grid size-12 place-items-center rounded-2xl bg-danger/10 text-xl font-bold text-danger"
            >
              !
            </span>
            <p className="mt-6 text-xs font-bold uppercase tracking-[0.16em] text-brand">
              Acceso en preparación
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              No se confirmó un permiso administrativo
            </h1>
            <p className="mt-3 text-sm leading-6 text-ink-muted">
              La sesión por sí sola no concede acceso empresarial. El servicio interno requiere una
              identidad vinculada y activa con rol ADMIN.
            </p>
            {signOutError ? (
              <p
                className="mt-5 rounded-xl border border-danger/30 bg-danger/10 p-3 text-sm text-danger"
                role="alert"
              >
                No se pudo cerrar la sesión. Comprueba la conexión e inténtalo nuevamente.
              </p>
            ) : null}
            <button
              className="mt-7 min-h-11 rounded-xl border border-line bg-surface px-4 text-sm font-semibold transition hover:bg-surface-muted disabled:cursor-wait disabled:opacity-60"
              disabled={signingOut}
              onClick={() => void signOut()}
              type="button"
            >
              {signingOut ? 'Cerrando sesión…' : 'Cerrar sesión'}
            </button>
          </div>
        ) : null}

        {state === 'error' ? (
          <div className="py-3">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand">
              Acceso privado
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              No se pudo comprobar el acceso
            </h1>
            <p className="mt-3 text-sm leading-6 text-ink-muted">
              El servicio de autenticación o autorización no respondió correctamente. No se muestra
              información protegida.
            </p>
            <button
              className="mt-7 min-h-11 rounded-xl bg-brand px-4 text-sm font-semibold text-white transition hover:bg-brand-strong dark:text-slate-950"
              onClick={retry}
              type="button"
            >
              Reintentar
            </button>
          </div>
        ) : null}
      </section>

      <p className="mx-auto mt-8 max-w-xl text-center text-xs leading-5 text-ink-muted">
        SafeGuard · Acceso limitado a identidades autorizadas. Las funciones comerciales aún no
        están habilitadas.
      </p>
    </main>
  );
}
