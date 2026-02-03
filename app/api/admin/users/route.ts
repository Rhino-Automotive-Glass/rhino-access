import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/app/lib/rbac/apiMiddleware';
import { createAdminClient } from '@/app/lib/supabase/admin';

export async function GET(request: NextRequest) {
  const authResult = await requireRole(request, ['admin']);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  try {
    const { supabase } = authResult;
    const adminClient = createAdminClient();

    const { data: userData, error: userError } =
      await adminClient.auth.admin.listUsers();

    if (userError) {
      return NextResponse.json({ error: userError.message }, { status: 400 });
    }

    const { data: rolesData, error: rolesError } = await supabase
      .from('user_roles')
      .select('*');

    if (rolesError) {
      return NextResponse.json({ error: rolesError.message }, { status: 400 });
    }

    const usersWithRoles = userData.users.map((user) => {
      const roleData = rolesData?.find((r: { user_id: string }) => r.user_id === user.id);
      return {
        id: user.id,
        email: user.email || '',
        role: roleData?.role || 'viewer',
        assigned_at: roleData?.assigned_at || user.created_at,
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
