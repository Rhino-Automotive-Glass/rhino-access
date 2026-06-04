import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/app/lib/rbac/apiMiddleware';
import { getFallbackAppMetadata, sortApps } from '@/app/lib/rbac/permissions';
import type { ConnectedApp } from '@/app/lib/rbac/types';

interface AppAccessCount {
  app: string;
  users_with_access: number;
}

/** GET — per-app summary: permission count + users with access */
export async function GET(request: NextRequest) {
  const authResult = await requirePermission(request, 'access', 'manage_users');
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { supabase } = authResult;

    const { data: appRows } = await supabase
      .from('connected_apps')
      .select('key, display_name, description, url, color, sort_order, is_active')
      .order('sort_order')
      .order('display_name');

    const { data: perms } = await supabase
      .from('permissions')
      .select('id, app');

    const { data: accessCounts, error: accessCountsError } = await supabase.rpc(
      'get_app_access_counts'
    );

    if (accessCountsError) {
      return NextResponse.json(
        { error: accessCountsError.message },
        { status: accessCountsError.code === '42501' ? 403 : 500 }
      );
    }

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

    const accessCountMap = new Map(
      ((accessCounts ?? []) as AppAccessCount[]).map((row) => [
        row.app,
        row.users_with_access,
      ])
    );

    const data = sortApps(Array.from(metadataMap.values())).map((app) => {
      const stats = appMap.get(app.key);
      return {
        ...app,
        total_permissions: stats?.total_permissions ?? 0,
        users_with_access: accessCountMap.get(app.key) ?? 0,
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
