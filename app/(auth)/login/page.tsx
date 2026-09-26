'use client'

import { Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { LoginForm } from '@rhino-automotive-glass/auth-ui'
import { createClient } from '@/app/lib/supabase/client'
import { SIGNUP_ENABLED } from '@/app/lib/auth/constants'

// /api/auth/callback and /api/auth/confirm redirect here with ?error= when a
// link fails, so surface it above the form instead of failing silently.
function CallbackError() {
  const error = useSearchParams().get('error')
  if (!error) return null

  return (
    <div
      role="alert"
      className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700"
    >
      {error}
    </div>
  )
}

export default function LoginPage() {
  const supabase = createClient()

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Welcome</h2>
        <p className="text-sm text-slate-600">Sign in to your account</p>
      </div>

      {/* useSearchParams needs a Suspense boundary above it, or this
          statically rendered route fails to build. */}
      <Suspense fallback={null}>
        <CallbackError />
      </Suspense>

      <LoginForm supabase={supabase} redirectTo="/" className="max-w-none" />

      <div className="flex flex-col items-center gap-2 text-sm">
        <Link
          href="/forgot-password"
          className="font-medium text-blue-600 hover:text-blue-500"
        >
          Forgot your password?
        </Link>
        {SIGNUP_ENABLED ? (
          <p className="text-slate-600">
            Don&apos;t have an account?{' '}
            <Link
              href="/signup"
              className="font-medium text-blue-600 hover:text-blue-500"
            >
              Sign up
            </Link>
          </p>
        ) : (
          <p className="text-slate-600">
            Access is by invitation. Ask an administrator to invite you.
          </p>
        )}
      </div>
    </div>
  )
}
