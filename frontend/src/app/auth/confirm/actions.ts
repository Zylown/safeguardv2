'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { readInviteToken } from '@/lib/auth-invite.mjs';

export async function confirmInvite(formData: FormData): Promise<never> {
  const tokenHash = formData.get('token_hash');
  const type = formData.get('type');

  if (typeof tokenHash !== 'string' || typeof type !== 'string') {
    redirect('/login?auth=invite-invalid');
  }

  const invite = readInviteToken(new URLSearchParams({ token_hash: tokenHash, type }));
  if (!invite) {
    redirect('/login?auth=invite-invalid');
  }

  let verified = false;
  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.verifyOtp({
      token_hash: invite.tokenHash,
      type: 'invite',
    });
    verified = !error;
  } catch {
    // Keep authentication errors generic and never expose the one-time token.
  }

  if (!verified) {
    redirect('/login?auth=invite-invalid');
  }

  redirect('/set-password');
}
