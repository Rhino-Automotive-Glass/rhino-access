import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/app/lib/rbac/apiMiddleware';

/** GET — list permission IDs assigned to a role */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ roleId: string }> }
) {
  const authResult = await requirePermission(request, 'access', 'manage_users');
  if (authResult instanceof NextResponse) return authResult;

  const { roleId } = await params;
  const { supabase } = authResult;

  const { data, error } = await supabase
    .from('role_permissions')
    .select('permission_id')
    .eq('role_id', roleId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ data: data ?? [] });
}
