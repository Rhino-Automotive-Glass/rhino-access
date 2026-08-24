'use client';

import { useRole } from '@/app/contexts/RoleContext';
import Link from 'next/link';
import RoleBadge from '@/app/components/ui/RoleBadge';
import {
  formatAppName,
  getAppMetadata,
  safeExternalUrl,
} from '@/app/lib/rbac/permissions';

export default function DashboardPage() {
  const {
    user,
    role,
    permissions,
    apps,
    authError,
    isLoading,
    hasPermission,
    refreshRole,
    clearSession,
  } = useRole();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-slate-50">
        <div className="bg-white rounded-lg shadow-lg p-8 flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <p className="text-slate-700 font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user || authError) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-slate-50 px-4">
        <div className="bg-white rounded-lg shadow-lg border border-slate-200 p-8 max-w-md w-full">
          <h1 className="text-xl font-semibold text-slate-900">
            Session needs attention
          </h1>
          <p className="text-sm text-slate-600 mt-2">
            We could not load your account permissions. Try again, or sign out
            and return to the login page.
          </p>
          {authError && (
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2 mt-4">
              {authError}
            </p>
          )}
          <div className="flex gap-3 mt-6">
            <button type="button" onClick={refreshRole} className="btn btn-secondary btn-md">
              Retry
            </button>
            <button type="button" onClick={clearSession} className="btn btn-primary btn-md">
              Sign Out
            </button>
          </div>
        </div>
      </main>
    );
  }

  // Group permissions by app, then by resource. Grouping by app alone rendered
  // resource-scoped permissions as repeated chips — Plan showed "view" and
  // "edit" twice because it has both on `tasks` and on `origin_links` — which
  // reads as a bug rather than as two distinct grants.
  const permsByApp = permissions.reduce(
    (acc, p) => {
      const byResource = (acc[p.app] ??= {});
      // '' keys the app-level permissions that have no resource (Rhino Access).
      (byResource[p.resource ?? ''] ??= []).push(p);
      return acc;
    },
    {} as Record<string, Record<string, typeof permissions>>
  );

  // Read order rather than whatever the query returned: broadest first, then
  // anything unrecognised alphabetically.
  const ACTION_ORDER = ['view', 'create', 'edit', 'delete', 'approve'];
  const sortActions = (a: string, b: string) => {
    const ia = ACTION_ORDER.indexOf(a);
    const ib = ACTION_ORDER.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b);
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-slate-50">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-slate-600 mt-1">Welcome back</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* User Info Card */}
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-slate-800 mb-3">Your Account</h2>
            <div className="space-y-3">
              <div>
                <span className="text-xs text-slate-500 uppercase tracking-wide">Email</span>
                <p className="text-sm text-slate-700">{user?.email}</p>
              </div>
              <div>
                <span className="text-xs text-slate-500 uppercase tracking-wide">Role</span>
                <div className="mt-1">
                  {role && <RoleBadge roleName={role.name} displayName={role.display_name} />}
                </div>
              </div>
            </div>
          </div>

          {/* Permissions Summary Card */}
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-slate-800 mb-3">Your Permissions</h2>
            {Object.keys(permsByApp).length === 0 ? (
              <p className="text-sm text-slate-500">No permissions assigned</p>
            ) : (
              <div className="space-y-3">
                {Object.entries(permsByApp).map(([app, byResource]) => {
                  const appInfo = getAppMetadata(apps, app);
                  const showResourceLabels = Object.keys(byResource).length > 1;
                  // This card is the only app listing a non-admin ever sees —
                  // /apps is gated behind manage_users — so it carries the links
                  // out to the ecosystem.
                  const href = appInfo.is_active
                    ? safeExternalUrl(appInfo.url)
                    : null;
                  return (
                    <div key={app}>
                      {href ? (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline uppercase tracking-wide"
                        >
                          {appInfo.display_name}
                          <svg
                            className="w-3 h-3"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            aria-hidden="true"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                            />
                          </svg>
                          <span className="sr-only">(opens in a new tab)</span>
                        </a>
                      ) : (
                        <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                          {appInfo.display_name}
                        </span>
                      )}
                      {Object.entries(byResource)
                        .sort(([a], [b]) => a.localeCompare(b))
                        .map(([resource, resourcePerms]) => (
                          <div key={resource} className="mt-1">
                            {/* Only label the resource when the app has more
                                than one — a lone "Product Codes" heading under
                                Rhino Code would be noise. */}
                            {showResourceLabels && resource && (
                              <span className="block text-[11px] text-slate-400 mb-0.5">
                                {formatAppName(resource)}
                              </span>
                            )}
                            <div className="flex flex-wrap gap-1">
                              {resourcePerms
                                .map((p) => p.action)
                                .sort(sortActions)
                                .map((action) => (
                                  <span
                                    key={`${resource}-${action}`}
                                    className="inline-block px-2 py-0.5 text-xs bg-slate-100 text-slate-600 rounded"
                                  >
                                    {action}
                                  </span>
                                ))}
                            </div>
                          </div>
                        ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Quick Actions Card */}
          {hasPermission('access', 'manage_users') && (
            <div className="card p-6">
              <h2 className="text-lg font-semibold text-slate-800 mb-3">Quick Actions</h2>
              <div className="space-y-2">
                <Link href="/users" className="btn btn-primary btn-md w-full">
                  Manage Users
                </Link>
                <Link href="/apps" className="btn btn-secondary btn-md w-full">
                  View Apps
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
