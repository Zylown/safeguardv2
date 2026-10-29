'use server';

import { redirect } from 'next/navigation';
import { getPasswordValidationError } from '@/lib/auth-invite.mjs';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export interface SetPasswordState {
  error?: string;
}

export async function setInitialPassword(
  _previousState: SetPasswordState,
  formData: FormData,
): Promise<SetPasswordState> {
  const password = formData.get('password');
  const confirmation = formData.get('confirmation');

  if (typeof password !== 'string' || typeof confirmation !== 'string') {
    return { error: 'Completa ambos campos de contraseña.' };
  }

  const validationError = getPasswordValidationError(password, confirmation);
  if (validationError === 'password-mismatch') {
    return { error: 'Las contraseñas no coinciden.' };
  }
  if (validationError === 'password-too-short') {
    return { error: 'La contraseña debe tener al menos 12 caracteres.' };
  }
  if (validationError === 'password-too-long') {
    return { error: 'La contraseña supera el máximo permitido.' };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: 'La invitación expiró o no es válida. Solicita una nueva invitación.' };
  }

  const { error: updateError } = await supabase.auth.updateUser({ password });
  if (updateError) {
    return { error: 'No se pudo guardar la contraseña. Inténtalo de nuevo.' };
  }

  await supabase.auth.signOut({ scope: 'local' });
  redirect('/login?auth=password-set');
}
