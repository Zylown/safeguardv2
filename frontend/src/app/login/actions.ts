'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export interface LoginState {
  error?: string;
}

export async function signIn(_previousState: LoginState, formData: FormData): Promise<LoginState> {
  const email = formData.get('email');
  const password = formData.get('password');
  if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
    return { error: 'Introduce tu correo y contraseña.' };
  }

  let supabase;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    return { error: 'El acceso no está configurado. Contacta al administrador.' };
  }

  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) {
    return {
      error:
        'No fue posible iniciar sesión. Verifica tus credenciales o contacta al administrador.',
    };
  }

  redirect('/admin');
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect('/login');
}
