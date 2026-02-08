import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/app/lib/rbac/apiMiddleware';
import { createAdminClient } from '@/app/lib/supabase/admin';

/** GET — per-app summary: permission count + users with access */
export async function GET(request: NextRequest) {
  const authResult = await requirePermission(request, 'access', 'manage_users');
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { supabase } = authResult;
    const adminClient = createAdminClient();

    // Get all permissions grouped by app
    const { data: perms } = await supabase
      .from('permissions')
      .select('id, app');

    // Get all users count
    const { data: usersData } = await adminClient.auth.admin.listUsers();
    const totalUsers = usersData?.users?.length ?? 0;

    // Group permission counts by app
    const appMap = new Map<string, { total_permissions: number }>();
    for (const p of perms ?? []) {
      const entry = appMap.get(p.app) ?? { total_permissions: 0 };
      entry.total_permissions++;
      appMap.set(p.app, entry);
    }

    const data = Array.from(appMap.entries()).map(([app, stats]) => ({
      app,
      total_permissions: stats.total_permissions,
      users_with_access: totalUsers, // all users have at least viewer-level access to non-access apps
    }));

    return NextResponse.json({ data });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
