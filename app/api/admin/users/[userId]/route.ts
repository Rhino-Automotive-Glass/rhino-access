import { NextRequest, NextResponse } from 'next/server';
import {
  requirePermission,
  requireMinLevel,
  requireTargetUserBelowRequester,
} from '@/app/lib/rbac/apiMiddleware';
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

    if (authError || !authUser.user || authUser.user.deleted_at) {
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
    const { user, supabase } = authResult;

    // Prevent self-deletion
    if (userId === user.id) {
      return NextResponse.json(
        { error: 'Cannot delete your own account' },
        { status: 403 }
      );
    }

    const hierarchyResult = await requireTargetUserBelowRequester(
      supabase,
      user.id,
      userId,
      'delete'
    );
    if (hierarchyResult instanceof NextResponse) return hierarchyResult;

    const adminClient = createAdminClient();

    // A soft delete leaves the auth.users row in place, so the FK cascades never
    // fire — RBAC rows have to be removed explicitly. Do this before revoking
    // sign-in so a failure here leaves the user fully intact and retryable.
    const { error: permissionsError } = await supabase
      .from('user_permissions')
      .delete()
      .eq('user_id', userId);

    if (permissionsError) {
      logDeleteStepError('removing permission overrides', userId, permissionsError);
      return NextResponse.json(
        { error: 'Failed to remove the user’s permission overrides' },
        { status: 400 }
      );
    }

    const { error: rolesError } = await supabase
      .from('user_roles')
      .delete()
      .eq('user_id', userId);

    if (rolesError) {
      logDeleteStepError('removing role assignment', userId, rolesError);
      return NextResponse.json(
        { error: 'Failed to remove the user’s role assignment' },
        { status: 400 }
      );
    }

    // Soft delete: revokes sign-in and hides the user from listings via
    // deleted_at, while preserving audit history and audit_logs references.
    const { error } = await adminClient.auth.admin.deleteUser(userId, true);

    if (error) {
      logDeleteStepError('deactivating auth user', userId, error);
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
