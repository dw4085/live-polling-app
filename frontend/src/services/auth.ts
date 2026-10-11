import { createAuthClient } from '@neondatabase/auth';

// Neon Auth (Google sign-in) for admins. Requests go through this site's
// /api/auth/* proxy so the session cookies are first-party.
export const authClient = createAuthClient(`${window.location.origin}/api/auth`);

export async function signInWithGoogle(returnPath: string): Promise<string | null> {
  const { error } = await authClient.signIn.social({
    provider: 'google',
    callbackURL: `${window.location.origin}${returnPath}`,
  });
  return error ? error.message || 'Google sign-in failed' : null;
}
