import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/app/lib/rbac/apiMiddleware';
import { createAdminClient } from '@/app/lib/supabase/admin';

export async function GET(request: NextRequest) {
  const authResult = await requirePermission(request, 'access', 'manage_users');
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { supabase } = authResult;
    const adminClient = createAdminClient();

    // List all auth users
    const { data: userData, error: userError } =
      await adminClient.auth.admin.listUsers();

    if (userError) {
      return NextResponse.json({ error: userError.message }, { status: 400 });
    }

    // Get user_roles joined with roles table
    const { data: rolesData, error: rolesError } = await supabase
      .from('user_roles')
      .select('user_id, role_id, assigned_at, roles(id, name, display_name, hierarchy_level)');

    if (rolesError) {
      return NextResponse.json({ error: rolesError.message }, { status: 400 });
    }

    const defaultRole = {
      id: '',
      name: 'viewer',
      display_name: 'Viewer',
      hierarchy_level: 10,
    };

    const usersWithRoles = userData.users.map((user) => {
      const userRoleRow = rolesData?.find(
        (r: { user_id: string }) => r.user_id === user.id
      );
      const role = (userRoleRow?.roles as unknown as typeof defaultRole) ?? defaultRole;

      return {
        id: user.id,
        email: user.email || '',
        role_id: userRoleRow?.role_id ?? '',
        role_name: role.name,
        role_display_name: role.display_name,
        hierarchy_level: role.hierarchy_level,
        assigned_at: userRoleRow?.assigned_at || user.created_at,
        created_at: user.created_at,
        is_banned: !!user.banned_until,
      };
    });

    return NextResponse.json({ data: usersWithRoles });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
