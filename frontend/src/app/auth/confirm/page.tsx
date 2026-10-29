import type { Metadata } from 'next';
import Link from 'next/link';
import { readInviteToken } from '@/lib/auth-invite.mjs';
import { confirmInvite } from './actions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Confirmar invitación | SafeGuard',
  referrer: 'no-referrer',
  robots: { index: false, follow: false },
};

interface InviteSearchParams {
  token_hash?: string | string[];
  type?: string | string[];
}

interface ConfirmInvitePageProps {
  searchParams: Promise<InviteSearchParams>;
}

export default async function ConfirmInvitePage({ searchParams }: ConfirmInvitePageProps) {
  const params = await searchParams;
  const tokenHash = typeof params.token_hash === 'string' ? params.token_hash : null;
  const type = typeof params.type === 'string' ? params.type : null;
  const invite =
    tokenHash && type
      ? readInviteToken(new URLSearchParams({ token_hash: tokenHash, type }))
      : null;

  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-12">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm sm:p-10">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-700">SafeGuard</p>
        <h1 className="mt-6 text-2xl font-semibold text-slate-950">Confirmar invitación</h1>
        {invite ? (
          <>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Confirma que deseas activar tu invitación. Después podrás establecer tu contraseña.
            </p>
            <form action={confirmInvite} className="mt-6">
              <input type="hidden" name="token_hash" value={invite.tokenHash} />
              <input type="hidden" name="type" value="invite" />
              <button
                className="w-full rounded-lg bg-teal-700 px-4 py-3 text-sm font-semibold text-white hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:ring-offset-2"
                type="submit"
              >
                Confirmar invitación
              </button>
            </form>
          </>
        ) : (
          <>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              El enlace no es válido o ha expirado. Solicita una nueva invitación.
            </p>
            <Link
              className="mt-6 inline-flex text-sm font-semibold text-teal-700 hover:text-teal-800"
              href="/login?auth=invite-invalid"
            >
              Volver al inicio de sesión
            </Link>
          </>
        )}
      </section>
    </main>
  );
}
