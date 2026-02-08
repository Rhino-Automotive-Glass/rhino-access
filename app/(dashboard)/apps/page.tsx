'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useRole } from '@/app/contexts/RoleContext';
import { APP_CONFIG } from '@/app/lib/rbac/permissions';

interface AppSummary {
  app: string;
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
            {APP_CONFIG.map((app) => {
              const summary = summaries.find((s) => s.app === app.key);
              return (
                <div key={app.key} className="card card-hover p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div
                      className={`w-10 h-10 ${app.color} rounded-lg flex items-center justify-center`}
                    >
                      <span className="text-white text-sm font-bold">
                        {app.name.split(' ')[1]?.[0] ?? app.name[0]}
                      </span>
                    </div>
                    <h2 className="text-lg font-semibold text-slate-900">{app.name}</h2>
                  </div>
                  <p className="text-sm text-slate-500 mb-4 truncate">{app.url}</p>
                  <div className="flex gap-6 text-sm">
                    <div>
                      <span className="text-2xl font-bold text-slate-900">
                        {summary?.total_permissions ?? 0}
                      </span>
                      <p className="text-slate-500">permissions</p>
                    </div>
                    <div>
                      <span className="text-2xl font-bold text-slate-900">
                        {summary?.users_with_access ?? 0}
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
