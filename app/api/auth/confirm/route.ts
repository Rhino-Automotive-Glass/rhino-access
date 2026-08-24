import { createClient } from '@/app/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'

/**
 * Entry point for links in Supabase auth emails (invite, signup confirmation,
 * magic link, email change, password recovery).
 *
 * The email templates must link here with the token hash as a QUERY parameter:
 *
 *   {{ .SiteURL }}/api/auth/confirm?token_hash={{ .TokenHash }}&type={{ .EmailActionType }}
 *
 * The default {{ .ConfirmationURL }} instead returns the session in the URL
 * FRAGMENT (#access_token=...), which is never transmitted to the server, so a
 * route handler cannot read it. verifyOtp exchanges the hash for a session and
 * sets the auth cookies server-side.
 */

const VALID_TYPES: EmailOtpType[] = [
  'invite',
  'signup',
  'magiclink',
  'recovery',
  'email_change',
  'email',
]

function loginRedirect(request: Request, message: string) {
  const url = new URL('/login', request.url)
  url.searchParams.set('error', message)
  return NextResponse.redirect(url)
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)

  const authError = searchParams.get('error')
  if (authError) {
    const description = searchParams.get('error_description')
    console.error('Auth confirm returned an error', {
      error: authError,
      code: searchParams.get('error_code'),
      description,
    })
    return loginRedirect(
      request,
      description ??
        'That link could not be used. It may have expired or already been used.'
    )
  }

  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type')

  if (!tokenHash || !type) {
    return loginRedirect(
      request,
      'That link is missing its confirmation token. Request a new one.'
    )
  }

  if (!VALID_TYPES.includes(type as EmailOtpType)) {
    console.error('Auth confirm received an unsupported type', { type })
    return loginRedirect(
      request,
      'That link is not a supported confirmation type. Request a new one.'
    )
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.verifyOtp({
    type: type as EmailOtpType,
    token_hash: tokenHash,
  })

  if (error) {
    console.error('Auth token verification failed', {
      type,
      code: error.code,
      status: error.status,
      error: error.message,
    })
    return loginRedirect(
      request,
      'We could not confirm that link. It may have expired or already been used.'
    )
  }

  // verifyOtp has established a session. A recovery link means the user still
  // has to choose a new password, so send them somewhere they can — /login
  // would strand an already-authenticated user on a sign-in form. Every other
  // type is done and can go to the dashboard.
  const destination = type === 'recovery' ? '/reset-password' : '/'
  return NextResponse.redirect(new URL(destination, request.url))
}
