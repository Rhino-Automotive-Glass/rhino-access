import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/app/lib/rbac/apiMiddleware';
import { updateUserRoleSchema } from '@/app/lib/validations/schemas';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const authResult = await requirePermission(request, 'access', 'manage_users');
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { userId } = await params;
    const body = await request.json();

    const parsed = updateUserRoleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { role_id } = parsed.data;
    const { supabase, user } = authResult;

    // Prevent self-role-change
    if (userId === user.id) {
      return NextResponse.json(
        { error: 'Cannot change your own role' },
        { status: 403 }
      );
    }

    // Verify the target role exists and is below the current user's level
    const { data: targetRole, error: roleError } = await supabase
      .from('roles')
      .select('id, hierarchy_level')
      .eq('id', role_id)
      .single();

    if (roleError || !targetRole) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

    // Get current user's hierarchy level
    const { data: currentUserRole } = await supabase
      .from('user_roles')
      .select('roles(hierarchy_level)')
      .eq('user_id', user.id)
      .single();

    const rolesJoin = currentUserRole?.roles as unknown as
      | { hierarchy_level: number }
      | null;
    const myLevel = rolesJoin?.hierarchy_level ?? 0;

    if (targetRole.hierarchy_level >= myLevel) {
      return NextResponse.json(
        { error: 'Cannot assign a role at or above your own level' },
        { status: 403 }
      );
    }

    const { error } = await supabase.from('user_roles').upsert(
      {
        user_id: userId,
        role_id,
        assigned_by: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );

    if (error) {
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
