'use client';

import { useEffect, useState, FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/app/lib/supabase/client';

/** Keep at or above the project's Auth minimum_password_length. */
const MIN_PASSWORD_LENGTH = 8;

/**
 * Second half of the password reset flow. /api/auth/confirm has already
 * exchanged the recovery token for a session and redirected here; this page
 * sets the new password.
 *
 * Without it the flow dead-ends: the recipient arrives authenticated but with
 * no way to change anything.
 */
export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  // Recovery links are single-use, expire, and are often opened in a different
  // browser than the one that requested them. Check before presenting a form
  // that cannot work.
  const [hasSession, setHasSession] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!cancelled) setHasSession(Boolean(data.session));
      })
      .catch(() => {
        if (!cancelled) setHasSession(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
      return;
    }

    setIsLoading(true);
    const supabase = createClient();
    const { error: authError } = await supabase.auth.updateUser({ password });
    setIsLoading(false);

    if (authError) {
      setError(authError.message);
      return;
    }

    setSuccess(true);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-slate-50">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-8">
          <div className="mb-8 text-center">
            <h1 className="text-2xl font-bold text-slate-900">Rhino Access</h1>
            <p className="text-slate-500 mt-1">Choose a new password</p>
          </div>

          {hasSession === null ? (
            <p className="text-sm text-slate-500 text-center">
              Checking your reset link...
            </p>
          ) : !hasSession ? (
            <>
              <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                This password reset link is no longer valid. It may have
                expired, already been used, or been opened in a different
                browser.
              </div>
              <Link
                href="/forgot-password"
                className="btn btn-primary btn-md mt-6 w-full"
              >
                Request a new link
              </Link>
            </>
          ) : success ? (
            <>
              <div className="px-4 py-3 rounded-lg bg-green-50 border border-green-200 text-green-800 text-sm">
                Your password has been updated.
              </div>
              <button
                onClick={() => router.push('/')}
                className="btn btn-primary btn-md mt-6 w-full"
              >
                Continue to Dashboard
              </button>
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
                    htmlFor="password"
                    className="block text-sm font-medium text-slate-700 mb-1"
                  >
                    New password
                  </label>
                  <input
                    id="password"
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="input-base"
                  />
                </div>

                <div>
                  <label
                    htmlFor="confirmPassword"
                    className="block text-sm font-medium text-slate-700 mb-1"
                  >
                    Confirm new password
                  </label>
                  <input
                    id="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="input-base"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="btn btn-primary btn-md w-full"
                >
                  {isLoading ? 'Updating...' : 'Update password'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
