'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useRole } from '@/app/contexts/RoleContext';
import { safeExternalUrl } from '@/app/lib/rbac/permissions';
import type { ConnectedApp } from '@/app/lib/rbac/types';

interface AppSummary extends ConnectedApp {
  total_permissions: number;
  users_with_access: number;
}

export default function AppsPage() {
  const { hasPermission, isLoading: authLoading } = useRole();
  const router = useRouter();
  const [summaries, setSummaries] = useState<AppSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !hasPermission('access', 'manage_users')) {
      router.push('/');
    }
  }, [authLoading, hasPermission, router]);

  useEffect(() => {
    fetch('/api/admin/apps')
      .then((r) => r.json())
      .then((d) => {
        setSummaries(d.data ?? []);
        setIsLoading(false);
      })
      .catch(() => setIsLoading(false));
  }, []);

  if (authLoading || !hasPermission('access', 'manage_users')) return null;

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-slate-50">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-slate-900">Connected Apps</h1>
          <p className="text-slate-600 mt-1">
            Overview of apps sharing this Supabase project
          </p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {summaries.map((app) => {
              // Inactive apps stay unlinked — the badge says they are not in
              // service, so offering a way in would contradict it.
              const href = app.is_active ? safeExternalUrl(app.url) : null;

              return (
              <div key={app.key} className="card card-hover p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className={`w-10 h-10 ${app.color} rounded-lg flex items-center justify-center shrink-0`}
                  >
                    <span className="text-white text-sm font-bold">
                      {app.display_name.split(' ')[1]?.[0] ?? app.display_name[0]}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold text-slate-900">
                      {app.display_name}
                    </h2>
                    {!app.is_active && (
                      <span className="text-xs font-medium text-slate-500">
                        Inactive
                      </span>
                    )}
                  </div>
                </div>
                {href ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 hover:underline mb-4 max-w-full"
                  >
                    <span className="truncate">{app.url}</span>
                    <svg
                      className="w-3.5 h-3.5 shrink-0"
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
                  <p className="text-sm text-slate-500 mb-4 truncate">
                    {app.description ?? app.key}
                  </p>
                )}
                <div className="flex gap-6 text-sm">
                  <div>
                    <span className="text-2xl font-bold text-slate-900">
                      {app.total_permissions}
                    </span>
                    <p className="text-slate-500">permissions</p>
                  </div>
                  <div>
                    <span className="text-2xl font-bold text-slate-900">
                      {app.users_with_access}
                    </span>
                    <p className="text-slate-500">users</p>
                  </div>
                </div>
              </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
