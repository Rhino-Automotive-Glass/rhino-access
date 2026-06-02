import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/app/lib/rbac/apiMiddleware';
import { getFallbackAppMetadata, sortApps } from '@/app/lib/rbac/permissions';
import type { ConnectedApp, Permission } from '@/app/lib/rbac/types';

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

  // Get resolved permissions via safe current-user RPC
  const { data: perms, error } = await supabase.rpc('get_my_permissions');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: appRows } = await supabase
    .from('connected_apps')
    .select('key, display_name, description, url, color, sort_order, is_active')
    .eq('is_active', true)
    .order('sort_order')
    .order('display_name');

  const appMap = new Map<string, ConnectedApp>();
  for (const app of (appRows ?? []) as ConnectedApp[]) {
    appMap.set(app.key, app);
  }

  for (const permission of (perms ?? []) as Permission[]) {
    if (!appMap.has(permission.app)) {
      appMap.set(permission.app, getFallbackAppMetadata(permission.app));
    }
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
    apps: sortApps(Array.from(appMap.values())),
  });
}
