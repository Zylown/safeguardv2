"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { getBetterAuthClient } from "@/lib/better-auth-client";

export function BetterAuthLoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setPending(true);
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");

    try {
      const result = await getBetterAuthClient().signIn.email({
        email,
        password,
      });
      if (result.error) {
        setError(
          result.error.status >= 500
            ? "El servicio de acceso no está disponible temporalmente. Inténtalo nuevamente más tarde."
            : "No fue posible iniciar sesión. Verifica tus credenciales o contacta al administrador.",
        );
        return;
      }
      const authorization = await fetch("/api/backend/me", {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (authorization.status === 403) {
        setError(
          "Tu acceso está pendiente de autorización empresarial. Contacta al administrador.",
        );
        return;
      }
      if (authorization.status === 401) {
        setError("No se pudo validar la sesión. Inténtalo nuevamente.");
        return;
      }
      if (!authorization.ok) {
        setError(
          "El servicio de autorización no está disponible temporalmente. Inténtalo nuevamente más tarde.",
        );
        return;
      }
      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError(
        "La autenticación experimental no está disponible. Verifica el estado de la base y contacta al administrador.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="mt-7 space-y-5" onSubmit={submit}>
      <div>
        <label
          className="block text-sm font-medium"
          htmlFor="better-auth-email"
        >
          Correo electrónico
        </label>
        <input
          autoComplete="username"
          className="mt-2 min-h-12 w-full rounded-xl border border-line bg-canvas px-3 text-ink placeholder:text-ink-muted"
          id="better-auth-email"
          name="email"
          required
          type="email"
        />
      </div>
      <div>
        <label
          className="block text-sm font-medium"
          htmlFor="better-auth-password"
        >
          Contraseña
        </label>
        <input
          autoComplete="current-password"
          className="mt-2 min-h-12 w-full rounded-xl border border-line bg-canvas px-3 pr-20 text-ink placeholder:text-ink-muted"
          id="better-auth-password"
          name="password"
          required
          type={passwordVisible ? "text" : "password"}
        />
        <button
          aria-label={
            passwordVisible ? "Ocultar contraseña" : "Mostrar contraseña"
          }
          aria-pressed={passwordVisible}
          className="-mt-11 mr-2 flex min-h-9 items-center justify-self-end rounded-lg px-2 text-xs font-semibold text-brand hover:bg-accent"
          onClick={() => setPasswordVisible((visible) => !visible)}
          type="button"
        >
          {passwordVisible ? "Ocultar" : "Mostrar"}
        </button>
      </div>
      {error ? (
        <p
          className="rounded-xl border border-danger/30 bg-danger/10 p-3 text-sm text-danger"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      <button
        className="min-h-12 w-full rounded-xl bg-brand px-4 font-semibold text-white transition hover:bg-brand-strong disabled:cursor-wait disabled:opacity-60 dark:text-slate-950"
        disabled={pending}
        type="submit"
      >
        {pending ? "Verificando…" : "Iniciar sesión"}
      </button>
      <p className="text-center text-xs leading-5 text-ink-muted">
        Acceso privado para identidades autorizadas. El alta de cuentas no está
        disponible aquí.
      </p>
    </form>
  );
}
