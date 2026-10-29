'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import { getBetterAuthClient } from '@/lib/better-auth-client';
import { ThemeToggle } from '@/components/better-auth/theme-toggle';

interface Enrollment {
  uri: string;
  backupCodes: string[];
}

export function TwoFactorSetup({ schemaReady }: { schemaReady: boolean }) {
  const router = useRouter();
  const [enrollment, setEnrollment] = useState<Enrollment>();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const [savedCodes, setSavedCodes] = useState(false);

  useEffect(() => {
    let active = true;
    void getBetterAuthClient()
      .getSession()
      .then((result) => {
        if (!active) return;
        if (result.error || !result.data?.session) router.replace('/login');
        else if (result.data.user.twoFactorEnabled === true) router.replace('/');
      })
      .catch(() => {
        if (active) setError('No se pudo comprobar la sesión. Vuelve a iniciar sesión.');
      });
    return () => {
      active = false;
    };
  }, [router]);

  async function startEnrollment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setPending(true);
    const password = String(new FormData(event.currentTarget).get('password') ?? '');
    try {
      const result = await getBetterAuthClient().twoFactor.enable({ password, method: 'totp' });
      if (result.error || result.data?.method !== 'totp' || !result.data.totpURI) {
        setError(
          'No se pudo iniciar el enrolamiento. Verifica la contraseña e inténtalo otra vez.',
        );
        return;
      }
      setEnrollment({ uri: result.data.totpURI, backupCodes: result.data.backupCodes });
    } catch {
      setError('La configuración TOTP no está disponible. Comprueba la preparación de la base.');
    } finally {
      setPending(false);
    }
  }

  async function verifyEnrollment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!enrollment || !savedCodes) return;
    setError(undefined);
    setPending(true);
    const code = String(new FormData(event.currentTarget).get('code') ?? '').replace(/\s/g, '');
    if (!/^\d{6}$/.test(code)) {
      setError('Ingresa el código de seis dígitos.');
      setPending(false);
      return;
    }
    try {
      const auth = getBetterAuthClient();
      const verified = await auth.twoFactor.verifyTotp({ code });
      if (verified.error) {
        setError('El código no es válido. La inscripción aún no se activó.');
        return;
      }
      const revoked = await auth.revokeSessions();
      if (revoked.error) {
        setError(
          'TOTP se confirmó, pero no se pudieron revocar todas las sesiones. No continúes al CRM; vuelve a iniciar sesión y contacta soporte.',
        );
        return;
      }
      setEnrollment(undefined);
      router.replace('/login?mfa=enabled');
      router.refresh();
    } catch {
      setError(
        'No se pudo completar el cierre de sesiones. El acceso al CRM seguirá bloqueado hasta un nuevo login.',
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="min-h-screen bg-canvas px-4 py-8 text-ink sm:px-6 sm:py-12">
      <div className="mx-auto max-w-2xl">
        <header className="flex items-center justify-between">
          <a className="text-lg font-semibold" href="/">
            SafeGuard
          </a>
          <ThemeToggle />
        </header>
        <section className="mt-10 rounded-3xl border border-line bg-surface p-6 shadow-sm sm:p-9">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand">
            Protección de cuenta
          </p>
          <h1 className="mt-2 text-2xl font-semibold">Configura Authenticator</h1>
          {!schemaReady ? (
            <p className="mt-4 text-sm leading-6 text-ink-muted">
              El esquema TOTP requiere aprobación y aplicación controlada de la migración. El acceso
              al CRM permanece bloqueado.
            </p>
          ) : !enrollment ? (
            <form className="mt-6 space-y-4" onSubmit={startEnrollment}>
              <p className="text-sm leading-6 text-ink-muted">
                Usa una aplicación TOTP compatible. SafeGuard no mostrará el secreto ni los códigos
                en otros dispositivos.
              </p>
              <label className="block text-sm font-medium" htmlFor="setup-password">
                Confirma tu contraseña
              </label>
              <input
                autoComplete="current-password"
                className="min-h-12 w-full rounded-xl border border-line bg-canvas px-4 text-ink"
                id="setup-password"
                name="password"
                required
                type="password"
              />
              <button
                className="min-h-12 rounded-xl bg-brand px-5 font-semibold text-white disabled:opacity-60 dark:text-slate-950"
                disabled={pending}
              >
                {pending ? 'Preparando…' : 'Iniciar configuración'}
              </button>
            </form>
          ) : (
            <div className="mt-6 space-y-6">
              <p className="text-sm leading-6 text-ink-muted">
                Escanea este QR local con tu Authenticator. La imagen y los códigos no se envían a
                servicios externos.
              </p>
              <div className="mx-auto w-fit rounded-2xl bg-white p-4">
                <QRCodeSVG
                  value={enrollment.uri}
                  size={220}
                  level="Q"
                  title="QR de configuración TOTP de SafeGuard"
                />
              </div>
              <section
                aria-label="Códigos de recuperación"
                className="rounded-2xl border border-line bg-canvas p-4"
              >
                <h2 className="font-semibold">Guarda tus códigos de recuperación</h2>
                <p className="mt-2 text-sm text-ink-muted">
                  Se muestran solo durante esta inscripción. Guárdalos fuera del navegador.
                </p>
                <ul className="mt-3 grid grid-cols-2 gap-2 font-mono text-sm">
                  {enrollment.backupCodes.map((code) => (
                    <li key={code}>{code}</li>
                  ))}
                </ul>
                <label className="mt-4 flex items-start gap-3 text-sm">
                  <input
                    checked={savedCodes}
                    className="mt-1"
                    onChange={(event) => setSavedCodes(event.target.checked)}
                    type="checkbox"
                  />
                  Confirmo que guardé los códigos en un lugar seguro.
                </label>
              </section>
              <form className="space-y-4" onSubmit={verifyEnrollment}>
                <label className="block text-sm font-medium" htmlFor="setup-totp-code">
                  Primer código de Authenticator
                </label>
                <input
                  autoComplete="one-time-code"
                  className="min-h-12 w-full rounded-xl border border-line bg-canvas px-4 text-center font-mono text-xl tracking-[0.35em]"
                  id="setup-totp-code"
                  inputMode="numeric"
                  maxLength={6}
                  name="code"
                  pattern="[0-9]{6}"
                  required
                />
                <button
                  className="min-h-12 rounded-xl bg-brand px-5 font-semibold text-white disabled:opacity-60 dark:text-slate-950"
                  disabled={pending || !savedCodes}
                >
                  {pending ? 'Verificando…' : 'Confirmar y cerrar sesiones anteriores'}
                </button>
              </form>
            </div>
          )}
          {error ? (
            <p
              className="mt-5 rounded-xl border border-danger/30 bg-danger/10 p-3 text-sm text-danger"
              role="alert"
            >
              {error}
            </p>
          ) : null}
        </section>
      </div>
    </main>
  );
}
