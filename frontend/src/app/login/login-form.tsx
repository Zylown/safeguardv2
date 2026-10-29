'use client';

import { useActionState } from 'react';
import { signIn } from './actions';

export function LoginForm() {
  const [state, action, pending] = useActionState(signIn, {});

  return (
    <form action={action} className="mt-8 space-y-5">
      <div>
        <label className="block text-sm font-medium" htmlFor="email">
          Correo electrónico
        </label>
        <input
          autoComplete="username"
          className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-sky-700 focus:ring-2 focus:ring-sky-100"
          id="email"
          name="email"
          required
          type="email"
        />
      </div>
      <div>
        <label className="block text-sm font-medium" htmlFor="password">
          Contraseña
        </label>
        <input
          autoComplete="current-password"
          className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-sky-700 focus:ring-2 focus:ring-sky-100"
          id="password"
          name="password"
          required
          type="password"
        />
      </div>
      {state.error && (
        <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800" role="alert">
          {state.error}
        </p>
      )}
      <button
        className="w-full rounded-lg bg-sky-900 px-4 py-3 font-medium text-white hover:bg-sky-800 disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        {pending ? 'Ingresando…' : 'Iniciar sesión'}
      </button>
      <p className="text-center text-xs leading-5 text-slate-500">
        Acceso solo para personal invitado. No hay registro público.
      </p>
    </form>
  );
}
