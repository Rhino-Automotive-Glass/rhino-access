'use client'

import Link from 'next/link'
import { ForgotPasswordForm } from '@rhino-automotive-glass/auth-ui'
import { createClient } from '@/app/lib/supabase/client'

export default function ForgotPasswordPage() {
  const supabase = createClient()

  // The recovery email template links to {{ .RedirectTo }}?token_hash=...,
  // handled by /api/auth/confirm, which routes type=recovery to
  // /reset-password. So redirectTo must be passed explicitly, must carry no
  // query string of its own, and must be allowlisted in Auth → Redirect URLs.
  // Several apps share this Supabase project and its single Site URL points at
  // another one, so relying on the package default would send Rhino Access
  // users to the wrong route. Submission only happens in the browser, so the
  // undefined value during server rendering is never used.
  const redirectTo =
    typeof window === 'undefined'
      ? undefined
      : `${window.location.origin}/api/auth/confirm`

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-slate-900 mb-2">
          Reset your password
        </h2>
        <p className="text-sm text-slate-600">
          We&apos;ll email you a link to choose a new one
        </p>
      </div>

      <ForgotPasswordForm
        supabase={supabase}
        redirectTo={redirectTo}
        className="max-w-none"
      />

      <Link
        href="/login"
        className="block text-center text-sm font-medium text-blue-600 hover:text-blue-500"
      >
        Back to sign in
      </Link>
    </div>
  )
}
