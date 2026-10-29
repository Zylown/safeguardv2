import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

export const metadata: Metadata = { title: 'Acceso | SafeGuard' };

export default function BetterAuthLoginPage() {
  redirect('/login');
}
