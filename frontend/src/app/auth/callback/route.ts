import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');

  if (!code) {
    return NextResponse.redirect(new URL('/login?auth=callback-error', requestUrl));
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(new URL('/login?auth=callback-error', requestUrl));
    }

    // Do not honor arbitrary redirect parameters from emailed auth links.
    return NextResponse.redirect(new URL('/admin', requestUrl));
  } catch {
    return NextResponse.redirect(new URL('/login?auth=callback-error', requestUrl));
  }
}
