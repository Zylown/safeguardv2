'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getBetterAuthClient } from '@/lib/better-auth-client';
import { signOutAndRedirect } from '@/lib/home-entry';
import { ThemeToggle } from '@/components/better-auth/theme-toggle';

interface InternalProfile {
  user: { email: string; fullName: string | null; role: 'ADMIN' | 'SUPER_ADMIN' };
}

type ProfileState =
  | { status: 'loading' }
  | { status: 'denied' }
  | { status: 'error' }
  | { status: 'ready'; profile: InternalProfile };

const futureSections = ['Fabricantes y catálogo', 'Cotizaciones'];

export function BetterAuthAdminPanel() {
  const router = useRouter();
  const [state, setState] = useState<ProfileState>({ status: 'loading' });
  const [menuOpen, setMenuOpen] = useState(false);
  const [signOutError, setSignOutError] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let active = true;
    async function loadProfile() {
      try {
        const auth = getBetterAuthClient();
        const session = await auth.getSession();
        if (!active) return;
        if (session.error || !session.data?.session) {
          router.replace('/login/better-auth');
          return;
        }
        if (session.data.user.twoFactorEnabled !== true) {
          router.replace('/login/better-auth/two-factor/setup');
          return;
        }

        const response = await fetch('/api/backend/me', {
          cache: 'no-store',
          credentials: 'same-origin',
        });
        if (!active) return;
        if (response.status === 401) {
          router.replace('/login/better-auth');
          return;
        }
        if (response.status === 403) {
          setState({ status: 'denied' });
          return;
        }
        if (!response.ok) {
          setState({ status: 'error' });
          return;
        }

        const profile = (await response.json()) as InternalProfile;
        if (profile.user.role !== 'ADMIN' && profile.user.role !== 'SUPER_ADMIN') {
          setState({ status: 'denied' });
          return;
        }
        setState({ status: 'ready', profile });
      } catch {
        if (active) setState({ status: 'error' });
      }
    }

    void loadProfile();
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
        router.replace('/login/better-auth');
        router.refresh();
      },
    );
    if (!signedOut) {
      setSignOutError(true);
      setSigningOut(false);
    }
  }

  if (state.status !== 'ready') {
    return (
      <main className="min-h-screen bg-canvas px-4 py-8 text-ink sm:px-6 sm:py-12">
        <div className="mx-auto max-w-2xl">
          <header className="flex items-center justify-between gap-4">
            <a className="flex items-center gap-3" href="/">
              <span className="grid size-10 place-items-center rounded-xl bg-brand font-bold text-white dark:text-slate-950">
                S
              </span>
              <span className="text-lg font-semibold tracking-tight">SafeGuard</span>
            </a>
            <ThemeToggle />
          </header>

          <section
            aria-live="polite"
            className="mt-12 rounded-2xl border border-line bg-surface p-6 shadow-sm sm:mt-16 sm:p-9"
          >
            {state.status === 'loading' ? (
              <div aria-label="Validando acceso" className="flex items-center gap-3" role="status">
                <span className="size-5 animate-spin rounded-full border-2 border-line border-t-brand" />
                <p className="text-sm text-ink-muted">Validando sesión y permisos…</p>
              </div>
            ) : null}
            {state.status === 'denied' ? (
              <div>
                <span
                  aria-hidden="true"
                  className="grid size-11 place-items-center rounded-xl bg-danger/10 text-xl text-danger"
                >
                  !
                </span>
                <h1 className="mt-4 text-xl font-semibold">Acceso restringido</h1>
                <p className="mt-2 text-sm leading-6 text-ink-muted">
                  No se pudo confirmar que esta cuenta tenga un vínculo interno activo con rol
                  ADMIN. El panel y sus funciones permanecen ocultos. Contacta al administrador de
                  SafeGuard.
                </p>
                {signOutError ? (
                  <p className="mt-4 text-sm text-danger" role="alert">
                    No se pudo cerrar la sesión. Inténtalo nuevamente.
                  </p>
                ) : null}
                <button
                  className="mt-6 min-h-11 rounded-xl border border-line px-4 text-sm font-semibold hover:bg-surface-muted disabled:cursor-wait disabled:opacity-60"
                  disabled={signingOut}
                  onClick={() => void signOut()}
                  type="button"
                >
                  {signingOut ? 'Saliendo…' : 'Cerrar sesión'}
                </button>
              </div>
            ) : null}
            {state.status === 'error' ? (
              <div>
                <h1 className="text-xl font-semibold">No se pudo validar el acceso</h1>
                <p className="mt-2 text-sm leading-6 text-ink-muted">
                  El servicio de autorización no respondió correctamente. No se muestra información
                  protegida.
                </p>
                <button
                  className="mt-6 min-h-11 rounded-xl border border-line px-4 text-sm font-semibold hover:bg-surface-muted"
                  onClick={() => window.location.reload()}
                  type="button"
                >
                  Reintentar
                </button>
              </div>
            ) : null}
          </section>
          <footer className="mt-8 text-xs leading-5 text-ink-muted">
            SafeGuard · Acceso privado. No se muestran funciones empresariales sin autorización.
          </footer>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <div className="flex min-h-screen">
        <aside className="hidden w-72 shrink-0 flex-col border-r border-line bg-surface lg:flex">
          <a
            className="flex h-20 items-center gap-3 border-b border-line px-7"
            href="/admin/better-auth"
          >
            <span className="grid size-10 place-items-center rounded-xl bg-brand font-bold text-white dark:text-slate-950">
              S
            </span>
            <span className="text-lg font-semibold tracking-tight">SafeGuard</span>
          </a>
          <nav aria-label="Navegación principal" className="flex-1 space-y-7 px-4 py-7">
            <div>
              <p className="px-3 text-[11px] font-bold uppercase tracking-[0.16em] text-ink-muted">
                Espacio de trabajo
              </p>
              <a
                aria-current="page"
                className="mt-3 flex min-h-11 items-center gap-3 rounded-xl bg-accent px-3 text-sm font-semibold text-brand-strong dark:text-brand"
                href="/admin/better-auth"
              >
                <span aria-hidden="true">▦</span> Resumen
              </a>
            </div>
            <div>
              <p className="px-3 text-[11px] font-bold uppercase tracking-[0.16em] text-ink-muted">
                CRM interno
              </p>
              <a
                href="/dashboard"
                className="mt-3 flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-ink hover:bg-surface-muted"
              >
                <span aria-hidden="true">▤</span> Solicitudes y empresas
              </a>
              <p className="mt-5 px-3 text-[11px] font-bold uppercase tracking-[0.16em] text-ink-muted">
                En preparación
              </p>
              <ul className="mt-3 space-y-1">
                {futureSections.map((section) => (
                  <li
                    key={section}
                    className="flex min-h-11 items-center justify-between gap-2 px-3 text-sm text-ink-muted"
                  >
                    <span>{section}</span>
                    <span className="shrink-0 rounded-full border border-line px-2 py-0.5 text-[10px]">
                      Próximamente
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </nav>
          <div className="m-4 rounded-2xl border border-line bg-canvas p-4">
            <p className="text-xs font-semibold text-ink">Acceso protegido</p>
            <p className="mt-1 text-xs leading-5 text-ink-muted">
              Permisos confirmados por el servicio interno.
            </p>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-10 flex min-h-20 items-center justify-between border-b border-line bg-surface/95 px-4 backdrop-blur sm:px-7 lg:px-10">
            <div className="flex items-center gap-3">
              <button
                aria-expanded={menuOpen}
                aria-label={menuOpen ? 'Cerrar navegación' : 'Abrir navegación'}
                className="grid size-11 place-items-center rounded-xl border border-line bg-surface text-lg lg:hidden"
                onClick={() => setMenuOpen((open) => !open)}
                type="button"
              >
                {menuOpen ? '×' : '☰'}
              </button>
              <div>
                <p className="text-xs font-medium text-ink-muted">Espacio interno</p>
                <h1 className="text-lg font-semibold tracking-tight">Resumen</h1>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <ThemeToggle />
              <button
                className="min-h-11 rounded-xl border border-line bg-surface px-3 text-sm font-semibold text-ink transition hover:bg-surface-muted disabled:cursor-wait disabled:opacity-60 sm:px-4"
                disabled={signingOut}
                onClick={() => void signOut()}
                type="button"
              >
                {signingOut ? (
                  'Saliendo…'
                ) : (
                  <>
                    <span className="hidden sm:inline">Cerrar sesión</span>
                    <span className="sm:hidden">Salir</span>
                  </>
                )}
              </button>
            </div>
          </header>

          {menuOpen ? (
            <nav
              aria-label="Navegación móvil"
              className="space-y-1 border-b border-line bg-surface px-4 py-3 lg:hidden"
            >
              <a
                aria-current="page"
                className="block rounded-lg bg-accent px-3 py-3 text-sm font-semibold text-brand-strong dark:text-brand"
                href="/admin/better-auth"
              >
                Resumen
              </a>
              {futureSections.map((section) => (
                <p key={section} className="px-3 py-3 text-sm text-ink-muted">
                  {section} · Próximamente
                </p>
              ))}
              <a
                href="/dashboard"
                className="block rounded-lg px-3 py-3 text-sm font-semibold text-brand"
              >
                CRM interno
              </a>
            </nav>
          ) : null}

          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-7 sm:px-7 sm:py-10 lg:px-10">
            <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-brand">Administración</p>
                <h2 className="mt-2 text-3xl font-semibold tracking-tight">Panel de SafeGuard</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-muted">
                  Espacio privado para el equipo autorizado. Las operaciones comerciales aún no
                  están habilitadas.
                </p>
              </div>
              <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-2 text-xs font-semibold text-ink-muted">
                <span aria-hidden="true" className="size-2 rounded-full bg-brand" /> Sesión privada
              </span>
            </div>

            {signOutError ? (
              <p
                className="mb-5 rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger"
                role="alert"
              >
                No se pudo cerrar la sesión. Inténtalo nuevamente y verifica el estado de conexión.
              </p>
            ) : null}

            <section
              aria-live="polite"
              className="rounded-2xl border border-line bg-surface p-5 shadow-sm sm:p-7"
            >
              <div className="flex flex-wrap items-center justify-between gap-5">
                <div className="flex items-center gap-4">
                  <span
                    className="grid size-14 place-items-center rounded-2xl bg-accent text-xl font-semibold text-brand-strong dark:text-brand"
                    aria-hidden="true"
                  >
                    {(state.profile.user.fullName || state.profile.user.email)
                      .slice(0, 1)
                      .toUpperCase()}
                  </span>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
                      Cuenta autorizada
                    </p>
                    <h3 className="mt-1 font-semibold">
                      {state.profile.user.fullName || state.profile.user.email}
                    </h3>
                    <p className="mt-1 text-sm text-ink-muted">{state.profile.user.email}</p>
                  </div>
                </div>
                <span className="rounded-full bg-accent px-3 py-1.5 text-xs font-bold text-brand-strong dark:text-brand">
                  ADMIN
                </span>
              </div>
            </section>

            {state.status === 'ready' ? (
              <section className="mt-6 grid gap-4 sm:grid-cols-2">
                <article className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
                  <p className="text-sm font-semibold">Tu espacio de trabajo</p>
                  <p className="mt-2 text-sm leading-6 text-ink-muted">
                    La base administrativa está protegida. No hay actividad operativa que mostrar
                    todavía.
                  </p>
                </article>
                <article className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
                  <p className="text-sm font-semibold">Seguridad de la cuenta</p>
                  <p className="mt-2 text-sm leading-6 text-ink-muted">
                    MFA, passkeys, recuperación y auditoría requieren una fase de diseño y
                    aprobación posterior.
                  </p>
                </article>
              </section>
            ) : null}

            <footer className="mt-10 border-t border-line pt-5 text-xs leading-5 text-ink-muted">
              SafeGuard · Panel privado. Supabase Auth y sus rutas existentes se mantienen sin
              cambios.
            </footer>
          </main>
        </div>
      </div>
    </div>
  );
}
