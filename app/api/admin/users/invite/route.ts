import { NextRequest, NextResponse } from 'next/server';
import {
  requirePermission,
  requireTargetUserBelowRequester,
} from '@/app/lib/rbac/apiMiddleware';
import { createAdminClient } from '@/app/lib/supabase/admin';
import { inviteUserSchema } from '@/app/lib/validations/schemas';

export async function POST(request: NextRequest) {
  const authResult = await requirePermission(request, 'access', 'manage_users');
  if (authResult instanceof NextResponse) return authResult;

  try {
    const body = await request.json();

    const parsed = inviteUserSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { email, role_id } = parsed.data;
    const { user: adminUser, supabase } = authResult;
    const adminClient = createAdminClient();

    // Verify the role exists
    const { data: roleCheck, error: roleError } = await supabase
      .from('roles')
      .select('id, hierarchy_level')
      .eq('id', role_id)
      .single();

    if (roleError || !roleCheck) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

    // Check hierarchy: can't assign role at or above own level
    const { data: myRole } = await supabase
      .from('user_roles')
      .select('roles(hierarchy_level)')
      .eq('user_id', adminUser.id)
      .single();

    const rolesJoin = myRole?.roles as unknown as
      | { hierarchy_level: number }
      | null;
    const myLevel = rolesJoin?.hierarchy_level ?? 0;

    if (roleCheck.hierarchy_level >= myLevel) {
      return NextResponse.json(
        { error: 'Cannot assign a role at or above your own level' },
        { status: 403 }
      );
    }

    // Invite the user via Supabase admin
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    const { data, error } = await adminClient.auth.admin.inviteUserByEmail(
      email,
      { redirectTo: `${siteUrl}/api/auth/callback` }
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Assign role immediately
    if (data.user) {
      const hierarchyResult = await requireTargetUserBelowRequester(
        supabase,
        adminUser.id,
        data.user.id,
        'change the role of'
      );
      if (hierarchyResult instanceof NextResponse) return hierarchyResult;

      const { error: roleAssignError } = await supabase
        .from('user_roles')
        .upsert(
          {
            user_id: data.user.id,
            role_id,
            assigned_by: adminUser.id,
          },
          { onConflict: 'user_id' }
        );

      // The invite email is already sent and the auth user exists. If the role
      // write fails the on_auth_user_created trigger has left them as a viewer,
      // so surface it instead of reporting a successful invite.
      if (roleAssignError) {
        console.error('Invite succeeded but role assignment failed', {
          userId: data.user.id,
          roleId: role_id,
          error: roleAssignError.message,
        });
        return NextResponse.json(
          {
            error:
              'Invitation was sent, but the requested role could not be assigned. The user currently has the default Viewer role — set their role from the user detail page.',
            user_id: data.user.id,
          },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      user_id: data.user?.id,
    });
  } catch (error) {
    console.error('Invite error:', error);
    return NextResponse.json(
      { error: 'Failed to invite user' },
      { status: 500 }
    );
  }
}
