import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isBetterAuthDevelopmentEnabled } from '@/lib/auth-feature-flag';
import { BetterAuthLoginForm } from './better-auth/login-form';
import { ThemeToggle } from '@/components/better-auth/theme-toggle';

export const metadata: Metadata = { title: 'Acceso | SafeGuard' };

const authNotices = {
  'password-set':
    'La contraseña quedó configurada. El acceso al panel requiere que un administrador habilite tu cuenta interna.',
  'invite-invalid':
    'El enlace de invitación no es válido o ha expirado. Solicita una nueva invitación.',
  'invite-required':
    'Abre el enlace de invitación y confirma tu cuenta antes de configurar la contraseña.',
} as const;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ auth?: string | string[]; mfa?: string }>;
}) {
  if (!isBetterAuthDevelopmentEnabled()) notFound();
  const { auth, mfa } = await searchParams;
  const notice =
    typeof auth === 'string' ? authNotices[auth as keyof typeof authNotices] : undefined;

  return (
    <main className="min-h-screen bg-canvas text-ink">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-5 py-5 sm:px-8 lg:px-12">
        <header className="flex items-center justify-between">
          <a className="text-lg font-semibold" href="/login">
            SafeGuard
          </a>
          <ThemeToggle />
        </header>
        <section className="mx-auto my-auto w-full max-w-md rounded-3xl border border-line bg-surface p-8 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand">
            Acceso interno
          </p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">Iniciar sesión</h1>
          <p className="mt-2 text-sm leading-6 text-ink-muted">
            Ingresa con tu cuenta SafeGuard autorizada.
          </p>
          {notice ? (
            <p
              role="status"
              className="mt-4 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900"
            >
              {notice}
            </p>
          ) : null}
          {mfa === 'enabled' ? (
            <p role="status" className="mt-4 text-sm text-brand">
              Authenticator quedó activado. Inicia sesión nuevamente.
            </p>
          ) : null}
          <BetterAuthLoginForm />
          <p className="mt-6 border-t border-line pt-5 text-xs text-ink-muted">
            Acceso privado. No hay registro público.
          </p>
        </section>
      </div>
    </main>
  );
}
