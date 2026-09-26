'use client'

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { SignupForm } from '@rhino-automotive-glass/auth-ui'
import { createClient } from '@/app/lib/supabase/client'
import { SIGNUP_ENABLED } from '@/app/lib/auth/constants'

/** Keep in step with reset-password and the project's Auth minimum_password_length. */
const MIN_PASSWORD_LENGTH = 8

export default function SignupPage() {
  if (!SIGNUP_ENABLED) notFound()

  const supabase = createClient()

  // The confirmation email template links to {{ .RedirectTo }}?token_hash=...,
  // handled by /api/auth/confirm. The package default (/auth/callback) does
  // not exist in this app, so pass it explicitly. It must carry no query string
  // and must be allowlisted in Auth → Redirect URLs. Submission only happens in
  // the browser, so the undefined value during server rendering is never used.
  const redirectTo =
    typeof window === 'undefined'
      ? undefined
      : `${window.location.origin}/api/auth/confirm`

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-slate-900 mb-2">
          Create an account
        </h2>
        <p className="text-sm text-slate-600">
          An administrator assigns your role after you sign up
        </p>
      </div>

      <SignupForm
        supabase={supabase}
        redirectTo={redirectTo}
        minLength={MIN_PASSWORD_LENGTH}
        className="max-w-none"
      />

      <p className="text-center text-sm text-slate-600">
        Already have an account?{' '}
        <Link
          href="/login"
          className="font-medium text-blue-600 hover:text-blue-500"
        >
          Sign in
        </Link>
      </p>
    </div>
  )
}
