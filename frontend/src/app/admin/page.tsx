import { redirect } from 'next/navigation';
import { signOut } from '../login/actions';
import { createSupabaseServerClient } from '@/lib/supabase/server';

interface CurrentUserResponse {
  user: { email: string; fullName: string | null; role: string };
}

export default async function AdminPage() {
  let supabase;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    redirect('/login?configuration=missing');
  }

  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  if (!accessToken) redirect('/login');

  const apiBase = (process.env.API_URL ?? 'http://localhost:4000/api/v1').replace(/\/$/, '');
  let response: Response;
  try {
    response = await fetch(`${apiBase}/me`, {
      headers: { authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    });
  } catch {
    return (
      <AccessState message="No fue posible contactar al servicio de identidad. Inténtalo más tarde." />
    );
  }

  if (response.status === 401) redirect('/login');
  if (response.status === 403) {
    return (
      <AccessState message="Tu cuenta no está habilitada para SafeGuard. Contacta al administrador." />
    );
  }
  if (!response.ok) {
    return (
      <AccessState message="No fue posible verificar el acceso interno. Inténtalo más tarde." />
    );
  }

  const { user } = (await response.json()) as CurrentUserResponse;
  return (
    <main className="min-h-screen px-5 py-10 sm:px-8">
      <section className="mx-auto max-w-4xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-800">
              SafeGuard
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">Panel interno</h1>
          </div>
          <form action={signOut}>
            <button className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50">
              Cerrar sesión
            </button>
          </form>
        </header>
        <div className="mt-8 rounded-xl bg-slate-50 p-5">
          <p className="text-sm text-slate-500">Sesión interna</p>
          <p className="mt-1 font-medium">{user.fullName || user.email}</p>
          <p className="mt-1 text-sm text-slate-600">Rol: {user.role}</p>
        </div>
        <p className="mt-6 text-sm leading-6 text-slate-600">
          El panel está habilitado. Las funciones operativas se incorporarán únicamente en fases
          aprobadas.
        </p>
      </section>
    </main>
  );
}

function AccessState({ message }: { message: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-5">
      <section className="max-w-lg rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold">Acceso no disponible</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">{message}</p>
      </section>
    </main>
  );
}
