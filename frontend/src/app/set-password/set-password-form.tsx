'use client';

import { useActionState } from 'react';
import { setInitialPassword, type SetPasswordState } from './actions';

const initialState: SetPasswordState = {};

export function SetPasswordForm() {
  const [state, formAction, pending] = useActionState(setInitialPassword, initialState);

  return (
    <form action={formAction} className="mt-6 space-y-4">
      <div>
        <label className="block text-sm font-medium" htmlFor="password">
          Nueva contraseña
        </label>
        <input
          autoComplete="new-password"
          className="mt-1 w-full rounded-md border px-3 py-2"
          id="password"
          maxLength={128}
          minLength={12}
          name="password"
          required
          type="password"
        />
      </div>
      <div>
        <label className="block text-sm font-medium" htmlFor="confirmation">
          Confirma la contraseña
        </label>
        <input
          autoComplete="new-password"
          className="mt-1 w-full rounded-md border px-3 py-2"
          id="confirmation"
          maxLength={128}
          minLength={12}
          name="confirmation"
          required
          type="password"
        />
      </div>
      {state.error ? (
        <p className="text-sm text-red-700" role="alert">
          {state.error}
        </p>
      ) : null}
      <button
        className="w-full rounded-md bg-slate-900 px-4 py-2 text-white disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        {pending ? 'Guardando…' : 'Guardar contraseña'}
      </button>
    </form>
  );
}
