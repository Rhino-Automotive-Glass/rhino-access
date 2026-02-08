import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/app/lib/rbac/apiMiddleware';

/** GET — list recent audit log entries */
export async function GET(request: NextRequest) {
  const authResult = await requirePermission(
    request,
    'access',
    'view_audit_logs'
  );
  if (authResult instanceof NextResponse) return authResult;

  const { supabase } = authResult;

  const { data, error } = await supabase
    .from('audit_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ data: data ?? [] });
}
