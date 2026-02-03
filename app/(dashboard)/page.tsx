'use client';

import { useRole } from '@/app/contexts/RoleContext';
import Link from 'next/link';

export default function DashboardPage() {
  const { user, role, permissions, isLoading } = useRole();

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
            <div className="space-y-2">
              <div>
                <span className="text-xs text-slate-500 uppercase tracking-wide">Email</span>
                <p className="text-sm text-slate-700">{user?.email}</p>
              </div>
              <div>
                <span className="text-xs text-slate-500 uppercase tracking-wide">Role</span>
                <div className="mt-1">
                  <span className={`px-3 py-1 text-xs font-semibold rounded-full ${
                    role === 'admin'
                      ? 'bg-purple-100 text-purple-800'
                      : role === 'qa'
                      ? 'bg-blue-100 text-blue-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}>
                    {role === 'qa' ? 'QA' : role}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Permissions Card */}
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-slate-800 mb-3">Permissions</h2>
            <ul className="space-y-2">
              <li className="flex items-center gap-2">
                <span className={`inline-block w-2 h-2 rounded-full ${permissions?.canManageUsers ? 'bg-green-500' : 'bg-gray-300'}`}></span>
                <span className="text-sm text-slate-700">Manage Users</span>
              </li>
              <li className="flex items-center gap-2">
                <span className={`inline-block w-2 h-2 rounded-full ${permissions?.canViewAuditLogs ? 'bg-green-500' : 'bg-gray-300'}`}></span>
                <span className="text-sm text-slate-700">View Audit Logs</span>
              </li>
            </ul>
          </div>

          {/* Quick Actions Card */}
          {permissions?.canManageUsers && (
            <div className="card p-6">
              <h2 className="text-lg font-semibold text-slate-800 mb-3">Quick Actions</h2>
              <Link
                href="/admin"
                className="btn btn-primary btn-md w-full"
              >
                Go to Admin Panel
              </Link>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
