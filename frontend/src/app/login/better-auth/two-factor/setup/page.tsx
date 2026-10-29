import { TwoFactorSetup } from './setup-form';
import { isBetterAuthDevelopmentEnabled } from '@/lib/auth-feature-flag';

export const dynamic = 'force-dynamic';

export default function TwoFactorSetupPage() {
  const schemaReady =
    isBetterAuthDevelopmentEnabled() && process.env.BETTER_AUTH_TOTP_SCHEMA_READY === 'true';
  return <TwoFactorSetup schemaReady={schemaReady} />;
}
