import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/app/lib/rbac/apiMiddleware';

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  const { user, supabase } = authResult;

  // Get user's role (joined with roles table)
  const { data: roleData } = await supabase
    .from('user_roles')
    .select('roles(id, name, display_name, hierarchy_level)')
    .eq('user_id', user.id)
    .single();

  // Get resolved permissions via RPC
  const { data: perms, error } = await supabase.rpc('get_user_permissions', {
    p_user_id: user.id,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rolesJoin = roleData?.roles as unknown as {
    id: string;
    name: string;
    display_name: string;
    hierarchy_level: number;
  } | null;

  const role = rolesJoin ?? {
    id: '',
    name: 'viewer',
    display_name: 'Viewer',
    hierarchy_level: 10,
  };

  return NextResponse.json({
    user: { id: user.id, email: user.email },
    role,
    permissions: perms ?? [],
  });
}
