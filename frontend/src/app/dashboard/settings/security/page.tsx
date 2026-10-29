import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isBetterAuthDevelopmentEnabled } from '@/lib/auth-feature-flag';
import { SecuritySettings } from './security-settings';

export const metadata: Metadata = { title: 'Seguridad | SafeGuard' };

export default function SecuritySettingsPage() {
  if (!isBetterAuthDevelopmentEnabled()) notFound();
  return <SecuritySettings schemaReady={process.env.BETTER_AUTH_TOTP_SCHEMA_READY === 'true'} />;
}
