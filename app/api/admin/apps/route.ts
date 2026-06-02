import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/app/lib/rbac/apiMiddleware';
import { createAdminClient } from '@/app/lib/supabase/admin';
import { getFallbackAppMetadata, sortApps } from '@/app/lib/rbac/permissions';
import type { ConnectedApp } from '@/app/lib/rbac/types';

/** GET — per-app summary: permission count + users with access */
export async function GET(request: NextRequest) {
  const authResult = await requirePermission(request, 'access', 'manage_users');
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { supabase } = authResult;
    const adminClient = createAdminClient();

    const { data: appRows } = await supabase
      .from('connected_apps')
      .select('key, display_name, description, url, color, sort_order, is_active')
      .order('sort_order')
      .order('display_name');

    const { data: perms } = await supabase
      .from('permissions')
      .select('id, app');

    // Get all users count
    const { data: usersData } = await adminClient.auth.admin.listUsers();
    const totalUsers =
      usersData?.users?.filter((user) => !user.deleted_at).length ?? 0;

    // Group permission counts by app
    const appMap = new Map<string, { total_permissions: number }>();
    for (const p of perms ?? []) {
      const entry = appMap.get(p.app) ?? { total_permissions: 0 };
      entry.total_permissions++;
      appMap.set(p.app, entry);
    }

    const metadataMap = new Map<string, ConnectedApp>();
    for (const app of (appRows ?? []) as ConnectedApp[]) {
      metadataMap.set(app.key, app);
    }

    for (const appKey of appMap.keys()) {
      if (!metadataMap.has(appKey)) {
        metadataMap.set(appKey, getFallbackAppMetadata(appKey));
      }
    }

    const data = sortApps(Array.from(metadataMap.values())).map((app) => {
      const stats = appMap.get(app.key);
      return {
        ...app,
        total_permissions: stats?.total_permissions ?? 0,
        users_with_access: totalUsers,
      };
    });

    return NextResponse.json({ data });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
