'use client';

import { useRole } from '@/app/contexts/RoleContext';
import Link from 'next/link';
import RoleBadge from '@/app/components/ui/RoleBadge';
import { APP_CONFIG } from '@/app/lib/rbac/permissions';

export default function DashboardPage() {
  const { user, role, permissions, isLoading, hasPermission } = useRole();

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

  // Group permissions by app for display
  const permsByApp = permissions.reduce(
    (acc, p) => {
      (acc[p.app] ??= []).push(p);
      return acc;
    },
    {} as Record<string, typeof permissions>
  );

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
                {Object.entries(permsByApp).map(([app, perms]) => {
                  const appInfo = APP_CONFIG.find((a) => a.key === app);
                  return (
                    <div key={app}>
                      <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                        {appInfo?.name ?? app}
                      </span>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {perms.map((p, i) => (
                          <span
                            key={i}
                            className="inline-block px-2 py-0.5 text-xs bg-slate-100 text-slate-600 rounded"
                          >
                            {p.action}
                          </span>
                        ))}
                      </div>
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
