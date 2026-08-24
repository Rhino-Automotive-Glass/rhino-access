'use client';

import { useState, FormEvent } from 'react';
import Link from 'next/link';
import { createClient } from '@/app/lib/supabase/client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    const supabase = createClient();
    // redirectTo must be passed explicitly and must be allowlisted in Auth →
    // Redirect URLs. Several apps share this Supabase project and its single
    // Site URL points at another one, so relying on the default would send
    // Rhino Access users to the wrong domain.
    const { error: authError } = await supabase.auth.resetPasswordForEmail(
      email,
      { redirectTo: `${window.location.origin}/api/auth/confirm` }
    );

    setIsLoading(false);

    if (authError) {
      setError(authError.message);
      return;
    }

    setSent(true);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-slate-50">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-8">
          <div className="mb-8 text-center">
            <h1 className="text-2xl font-bold text-slate-900">Rhino Access</h1>
            <p className="text-slate-500 mt-1">Reset your password</p>
          </div>

          {sent ? (
            <>
              {/* Deliberately does not reveal whether the address has an
                  account — that would let anyone enumerate your users. */}
              <div className="px-4 py-3 rounded-lg bg-green-50 border border-green-200 text-green-800 text-sm">
                If an account exists for <strong>{email}</strong>, a password
                reset link is on its way. The link can only be used once and
                expires shortly.
              </div>
              <Link href="/login" className="btn btn-primary btn-md mt-6 w-full">
                Back to Sign In
              </Link>
            </>
          ) : (
            <>
              {error && (
                <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label
                    htmlFor="email"
                    className="block text-sm font-medium text-slate-700 mb-1"
                  >
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    className="input-base"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="btn btn-primary btn-md w-full"
                >
                  {isLoading ? 'Sending...' : 'Send reset link'}
                </button>
              </form>

              <p className="mt-6 text-center text-sm text-slate-500">
                <Link
                  href="/login"
                  className="text-blue-600 hover:text-blue-700 font-medium"
                >
                  Back to sign in
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
