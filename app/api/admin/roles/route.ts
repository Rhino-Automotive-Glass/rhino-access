import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/app/lib/rbac/apiMiddleware';

/** GET — list all roles (any authenticated user can read) */
export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  const { supabase } = authResult;

  const { data, error } = await supabase
    .from('roles')
    .select('id, name, display_name, description, hierarchy_level, is_system')
    .order('hierarchy_level', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ data: data ?? [] });
}
