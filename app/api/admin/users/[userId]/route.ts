import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, requireMinLevel } from '@/app/lib/rbac/apiMiddleware';
import { createAdminClient } from '@/app/lib/supabase/admin';

function logDeleteStepError(
  step: string,
  userId: string,
  error: { message: string }
) {
  console.error(`Delete user failed during ${step}`, {
    userId,
    error: error.message,
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const authResult = await requirePermission(request, 'access', 'manage_users');
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { userId } = await params;
    const { supabase } = authResult;
    const adminClient = createAdminClient();

    // Get auth user info
    const { data: authUser, error: authError } =
      await adminClient.auth.admin.getUserById(userId);

    if (authError || !authUser.user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get user's role
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role_id, assigned_at, roles(id, name, display_name, hierarchy_level)')
      .eq('user_id', userId)
      .single();

    // Get the role's default permission IDs
    const roleId = roleData?.role_id;
    let rolePermissionIds: string[] = [];

    if (roleId) {
      const { data: rolePerms } = await supabase
        .from('role_permissions')
        .select('permission_id')
        .eq('role_id', roleId);

      rolePermissionIds = (rolePerms ?? []).map(
        (rp: { permission_id: string }) => rp.permission_id
      );
    }

    const defaultRole = {
      id: '',
      name: 'viewer',
      display_name: 'Viewer',
      hierarchy_level: 10,
    };

    return NextResponse.json({
      id: authUser.user.id,
      email: authUser.user.email ?? '',
      role_id: roleData?.role_id ?? '',
      role: (roleData?.roles as unknown as typeof defaultRole) ?? defaultRole,
      role_permission_ids: rolePermissionIds,
      assigned_at: roleData?.assigned_at ?? authUser.user.created_at,
      created_at: authUser.user.created_at,
      is_banned: !!authUser.user.banned_until,
    });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const authResult = await requireMinLevel(request, 80);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { userId } = await params;
    const { user, supabase, hierarchyLevel } = authResult;
    const adminClient = createAdminClient();

    // Prevent self-deletion
    if (userId === user.id) {
      return NextResponse.json(
        { error: 'Cannot delete your own account' },
        { status: 403 }
      );
    }

    // Check that target user's role is below the requester's level
    const { data: targetRole } = await supabase
      .from('user_roles')
      .select('roles(hierarchy_level)')
      .eq('user_id', userId)
      .single();

    const targetLevel =
      (targetRole?.roles as unknown as { hierarchy_level: number } | null)
        ?.hierarchy_level ?? 0;

    if (targetLevel >= hierarchyLevel) {
      return NextResponse.json(
        { error: 'Cannot delete a user at or above your own level' },
        { status: 403 }
      );
    }

    const {
      data: targetAuthUser,
      error: targetAuthError,
    } = await adminClient.auth.admin.getUserById(userId);

    if (targetAuthError || !targetAuthUser.user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const cleanupSteps = [
      {
        name: 'clearing audit log actor references',
        run: () =>
          adminClient.from('audit_logs').update({ user_id: null }).eq('user_id', userId),
      },
      {
        name: 'clearing role assignment references',
        run: () =>
          adminClient.from('user_roles').update({ assigned_by: null }).eq('assigned_by', userId),
      },
      {
        name: 'clearing permission grant references',
        run: () =>
          adminClient
            .from('user_permissions')
            .update({ granted_by: null })
            .eq('granted_by', userId),
      },
      {
        name: 'deleting user permission overrides',
        run: () =>
          adminClient.from('user_permissions').delete().eq('user_id', userId),
      },
      {
        name: 'deleting user role assignments',
        run: () => adminClient.from('user_roles').delete().eq('user_id', userId),
      },
    ];

    for (const step of cleanupSteps) {
      const { error } = await step.run();
      if (error) {
        logDeleteStepError(step.name, userId, error);
        return NextResponse.json(
          { error: 'Failed to remove related user records' },
          { status: 400 }
        );
      }
    }

    // Delete the auth user (this is permanent)
    const { error } = await adminClient.auth.admin.deleteUser(userId);

    if (error) {
      logDeleteStepError('deleting auth user', userId, error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
