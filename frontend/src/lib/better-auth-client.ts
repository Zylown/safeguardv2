'use client';

import { createAuthClient } from 'better-auth/react';
import { twoFactorClient } from 'better-auth/client/plugins';

export function getBetterAuthClient() {
  return createAuthClient({
    baseURL: window.location.origin,
    plugins: [twoFactorClient({ twoFactorPage: '/login/better-auth/two-factor' })],
  });
}
