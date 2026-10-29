import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { SetPasswordForm } from './set-password-form';

export default async function SetPasswordPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect('/login?auth=invite-required');
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-6 py-12">
      <section className="w-full rounded-xl border bg-white p-8 shadow-sm">
        <p className="text-sm font-medium text-slate-600">SafeGuard · Invitación</p>
        <h1 className="mt-2 text-2xl font-semibold">Configura tu contraseña</h1>
        <p className="mt-3 text-sm text-slate-600">
          Después podrás iniciar sesión. El acceso al panel se habilita cuando un administrador
          vincule tu cuenta.
        </p>
        <SetPasswordForm />
      </section>
    </main>
  );
}
