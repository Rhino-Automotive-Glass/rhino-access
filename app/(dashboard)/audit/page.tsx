'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useRole } from '@/app/contexts/RoleContext';
import { toast } from '@/app/components/ui/Toast';

const PAGE_SIZE = 50;

// Mirrors the audit_logs columns written by log_role_change() in migration 001.
// These are nullable in the table, so the filter below must not assume strings.
interface AuditEntry {
  id: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  user_id: string | null;
  user_email: string | null;
  created_at: string;
}

export default function AuditPage() {
  const { hasPermission, isLoading: authLoading } = useRole();
  const router = useRouter();
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [filter, setFilter] = useState('');
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  // Guards against a slow response for an earlier search overwriting a newer
  // one — typing "user_role" fires several requests that can land out of order.
  const requestRef = useRef(0);

  useEffect(() => {
    if (!authLoading && !hasPermission('access', 'view_audit_logs')) {
      router.push('/');
    }
  }, [authLoading, hasPermission, router]);

  const fetchPage = useCallback(
    async (query: string, offset: number) => {
      const requestId = ++requestRef.current;
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(offset),
      });
      if (query) params.set('q', query);

      const res = await fetch(`/api/admin/audit?${params}`, {
        cache: 'no-store',
      });

      // A stale response must not clobber newer state.
      if (requestId !== requestRef.current) return null;

      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(
          typeof payload?.error === 'string'
            ? payload.error
            : 'Failed to load audit log'
        );
      }

      return (await res.json()) as {
        data: AuditEntry[];
        total: number;
        hasMore: boolean;
      };
    },
    []
  );

  // Search runs in the database, so it covers the whole history rather than the
  // page already loaded. Debounced to avoid a request per keystroke.
  useEffect(() => {
    if (authLoading || !hasPermission('access', 'view_audit_logs')) return;

    let cancelled = false;
    const handle = setTimeout(async () => {
      setIsLoading(true);
      try {
        const page = await fetchPage(filter.trim(), 0);
        if (!page || cancelled) return;
        setLogs(page.data);
        setTotal(page.total);
        setHasMore(page.hasMore);
      } catch (err) {
        console.error('Error loading audit logs:', err);
        if (!cancelled) toast('error', (err as Error).message);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [filter, authLoading, hasPermission, fetchPage]);

  const loadMore = async () => {
    setIsLoadingMore(true);
    try {
      const page = await fetchPage(filter.trim(), logs.length);
      if (!page) return;
      setLogs((prev) => [...prev, ...page.data]);
      setTotal(page.total);
      setHasMore(page.hasMore);
    } catch (err) {
      console.error('Error loading more audit logs:', err);
      toast('error', (err as Error).message);
    } finally {
      setIsLoadingMore(false);
    }
  };

  const refresh = () => {
    // Re-triggers the search effect without changing the query.
    setFilter((f) => f);
    setLogs([]);
    setIsLoading(true);
    fetchPage(filter.trim(), 0)
      .then((page) => {
        if (!page) return;
        setLogs(page.data);
        setTotal(page.total);
        setHasMore(page.hasMore);
      })
      .catch((err) => toast('error', (err as Error).message))
      .finally(() => setIsLoading(false));
  };

  const actionColors: Record<string, string> = {
    create: 'bg-green-100 text-green-800',
    update: 'bg-blue-100 text-blue-800',
    delete: 'bg-red-100 text-red-800',
    invite: 'bg-purple-100 text-purple-800',
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
          <button onClick={refresh} className="btn btn-secondary btn-sm">
            Refresh
          </button>
        </div>

        <div className="card p-6">
          <div className="mb-4">
            <input
              type="text"
              placeholder="Search by action, resource type, ID, or user..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="input-base max-w-sm"
            />
            {!isLoading && (
              <p className="text-xs text-slate-500 mt-2">
                {total === 0
                  ? 'No matching entries'
                  : `Showing ${logs.length} of ${total} ${
                      total === 1 ? 'entry' : 'entries'
                    }${filter.trim() ? ' matching your search' : ''}`}
              </p>
            )}
          </div>

          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : logs.length === 0 ? (
            <p className="text-center text-slate-500 py-12">No audit log entries found</p>
          ) : (
            <div className="space-y-3">
              {logs.map((entry) => (
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
                    <p className="text-xs text-slate-500 mt-0.5">
                      by {entry.user_email ?? 'system'}
                    </p>
                    {/* A delete has no new_data, so showing only that would
                        render the most important rows — access being revoked —
                        as an empty entry. Fall back to what was removed. */}
                    {(() => {
                      const payload = entry.new_data ?? entry.old_data;
                      if (!payload) return null;
                      return (
                        <pre className="mt-1 text-xs text-slate-500 overflow-hidden text-ellipsis max-w-full">
                          {!entry.new_data && entry.old_data ? 'removed: ' : ''}
                          {JSON.stringify(payload, null, 2).slice(0, 200)}
                        </pre>
                      );
                    })()}
                  </div>
                  <div className="flex-shrink-0 text-xs text-slate-400 whitespace-nowrap">
                    {new Date(entry.created_at).toLocaleString()}
                  </div>
                </div>
              ))}

              {hasMore && (
                <div className="pt-2 flex justify-center">
                  <button
                    onClick={loadMore}
                    disabled={isLoadingMore}
                    className="btn btn-secondary btn-sm"
                  >
                    {isLoadingMore
                      ? 'Loading...'
                      : `Load ${Math.min(PAGE_SIZE, total - logs.length)} more`}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
