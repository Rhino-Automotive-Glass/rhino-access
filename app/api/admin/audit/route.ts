import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/app/lib/rbac/apiMiddleware';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/** Row shape returned by the search_audit_logs RPC (migration 011). */
interface AuditRow {
  id: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  user_id: string | null;
  user_email: string | null;
  created_at: string;
  /** Window count repeated on every row; stripped before responding. */
  total_count: number;
}

function parseIntParam(value: string | null, fallback: number) {
  if (value === null) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * GET — audit log entries, newest first.
 *
 * Search and paging both run in the database (search_audit_logs). Filtering in
 * the browser over a fixed window would only ever search the loaded page, and
 * an audit tool that reports "no entries found" for records it simply has not
 * fetched is worse than one that does not filter at all.
 */
export async function GET(request: NextRequest) {
  const authResult = await requirePermission(
    request,
    'access',
    'view_audit_logs'
  );
  if (authResult instanceof NextResponse) return authResult;

  const { supabase } = authResult;
  const { searchParams } = new URL(request.url);

  const limit = Math.min(
    Math.max(parseIntParam(searchParams.get('limit'), DEFAULT_LIMIT), 1),
    MAX_LIMIT
  );
  const offset = Math.max(parseIntParam(searchParams.get('offset'), 0), 0);
  const query = searchParams.get('q')?.trim() || null;

  const { data, error } = await supabase.rpc('search_audit_logs', {
    p_query: query,
    p_limit: limit,
    p_offset: offset,
  });

  if (error) {
    if (error.code === '42501') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    console.error('Audit log query failed', {
      code: error.code,
      error: error.message,
    });
    return NextResponse.json(
      { error: 'Could not load the audit log. Please try again.' },
      { status: 500 }
    );
  }

  const rows = (data ?? []) as AuditRow[];
  // total_count is a window function repeated on every row; it is absent when
  // the page is empty, in which case the total is the offset reached so far.
  const total = rows.length > 0 ? Number(rows[0].total_count) : offset;

  return NextResponse.json({
    data: rows.map(({ total_count, ...entry }) => {
      void total_count;
      return entry;
    }),
    total,
    limit,
    offset,
    hasMore: offset + rows.length < total,
  });
}
