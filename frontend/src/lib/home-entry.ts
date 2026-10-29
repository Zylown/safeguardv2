export type HomeSessionState = 'active' | 'missing' | 'failed';
export type HomeAuthorizationState = 'unchecked' | 'admin' | 'denied' | 'missing' | 'failed';
export type HomeEntryDestination = 'checking' | 'login' | 'dashboard' | 'restricted' | 'retry';

export function decideHomeEntry(
  session: HomeSessionState,
  authorization: HomeAuthorizationState,
): HomeEntryDestination {
  if (session === 'missing' || authorization === 'missing') return 'login';
  if (session === 'failed' || authorization === 'failed') return 'retry';
  if (session === 'active' && authorization === 'admin') return 'dashboard';
  if (session === 'active' && authorization === 'denied') return 'restricted';
  return 'checking';
}

export async function signOutAndRedirect(
  signOut: () => Promise<{ error?: unknown }>,
  redirectToLogin: () => void,
): Promise<boolean> {
  try {
    const result = await signOut();
    if (result.error) return false;
    redirectToLogin();
    return true;
  } catch {
    return false;
  }
}
