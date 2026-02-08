import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/app/lib/rbac/apiMiddleware';

/** GET — list all permission definitions */
export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  const { supabase } = authResult;

  const { data, error } = await supabase
    .from('permissions')
    .select('id, app, action, resource, display_name, description')
    .order('app')
    .order('action');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ data: data ?? [] });
}
