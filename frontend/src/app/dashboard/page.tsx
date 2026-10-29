import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isBetterAuthDevelopmentEnabled } from '@/lib/auth-feature-flag';
import { CrmWorkspace } from './crm-workspace';

export const metadata: Metadata = { title: 'CRM interno | SafeGuard' };

export default function DashboardPage() {
  if (!isBetterAuthDevelopmentEnabled()) notFound();
  return <CrmWorkspace />;
}
