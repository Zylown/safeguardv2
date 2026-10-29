import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

export const metadata: Metadata = { title: 'Panel experimental | SafeGuard' };

export default function BetterAuthAdminPage() {
  redirect('/dashboard');
}
