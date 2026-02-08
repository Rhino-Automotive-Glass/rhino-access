'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useRole } from '@/app/contexts/RoleContext';

interface AuditEntry {
  id: string;
  action: string;
  resource_type: string;
  resource_id: string;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  performed_by: string | null;
  created_at: string;
}

export default function AuditPage() {
  const { hasPermission, isLoading: authLoading } = useRole();
  const router = useRouter();
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    if (!authLoading && !hasPermission('access', 'view_audit_logs')) {
      router.push('/');
    }
  }, [authLoading, hasPermission, router]);

  useEffect(() => {
    loadLogs();
  }, []);

  const loadLogs = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/admin/audit');
      if (res.ok) {
        const data = await res.json();
        setLogs(data.data ?? []);
      }
    } catch (err) {
      console.error('Error loading audit logs:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const filtered = logs.filter(
    (l) =>
      !filter ||
      l.action.includes(filter) ||
      l.resource_type.includes(filter) ||
      l.resource_id.includes(filter)
  );

  const actionColors: Record<string, string> = {
    create: 'bg-green-100 text-green-800',
    update: 'bg-blue-100 text-blue-800',
    delete: 'bg-red-100 text-red-800',
  };

  if (authLoading || !hasPermission('access', 'view_audit_logs')) return null;

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-slate-50">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Audit Log</h1>
            <p className="text-slate-600 mt-1">Track changes across the system</p>
          </div>
          <button onClick={loadLogs} className="btn btn-secondary btn-sm">
            Refresh
          </button>
        </div>

        <div className="card p-6">
          <div className="mb-4">
            <input
              type="text"
              placeholder="Filter by action, resource type, or ID..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="input-base max-w-sm"
            />
          </div>

          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-slate-500 py-12">No audit log entries found</p>
          ) : (
            <div className="space-y-3">
              {filtered.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-start gap-4 p-4 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex-shrink-0 mt-0.5">
                    <span
                      className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${
                        actionColors[entry.action] ?? 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {entry.action}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900">
                      {entry.resource_type}
                      {entry.resource_id && (
                        <span className="ml-2 text-slate-400 font-mono text-xs">
                          {entry.resource_id.slice(0, 8)}...
                        </span>
                      )}
                    </p>
                    {entry.new_data && (
                      <pre className="mt-1 text-xs text-slate-500 overflow-hidden text-ellipsis max-w-full">
                        {JSON.stringify(entry.new_data, null, 2).slice(0, 200)}
                      </pre>
                    )}
                  </div>
                  <div className="flex-shrink-0 text-xs text-slate-400 whitespace-nowrap">
                    {new Date(entry.created_at).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
