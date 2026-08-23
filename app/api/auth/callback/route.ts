import { createClient } from '@/app/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * Every failure path lands on /login with a human-readable ?error=, because
 * redirecting to / on a failed exchange just bounces off the dashboard layout's
 * auth guard and back to /login with no explanation of what went wrong.
 */
function loginRedirect(request: Request, message: string) {
  const url = new URL('/login', request.url)
  url.searchParams.set('error', message)
  return NextResponse.redirect(url)
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)

  // Supabase reports a rejected or expired link via these params, not via `code`.
  const authError = searchParams.get('error')
  if (authError) {
    const description = searchParams.get('error_description')
    console.error('Auth callback returned an error', {
      error: authError,
      code: searchParams.get('error_code'),
      description,
    })
    return loginRedirect(
      request,
      description ??
        'That sign-in link could not be used. It may have expired or already been used.'
    )
  }

  const code = searchParams.get('code')
  if (!code) {
    return loginRedirect(
      request,
      'That sign-in link is missing its confirmation code. Request a new one.'
    )
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    console.error('Auth code exchange failed', {
      code: error.code,
      status: error.status,
      error: error.message,
    })
    return loginRedirect(
      request,
      'We could not complete your sign-in. The link may have expired or already been used.'
    )
  }

  return NextResponse.redirect(new URL('/', request.url))
}
