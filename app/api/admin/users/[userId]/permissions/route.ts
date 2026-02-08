import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/app/lib/rbac/apiMiddleware';
import { updateUserPermissionsSchema } from '@/app/lib/validations/schemas';

/** GET — list user-specific permission overrides */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const authResult = await requirePermission(
    request,
    'access',
    'manage_permissions'
  );
  if (authResult instanceof NextResponse) return authResult;

  const { userId } = await params;
  const { supabase } = authResult;

  const { data, error } = await supabase
    .from('user_permissions')
    .select('permission_id, granted')
    .eq('user_id', userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ data: data ?? [] });
}

/** PUT — replace all user-specific permission overrides */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const authResult = await requirePermission(
    request,
    'access',
    'manage_permissions'
  );
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { userId } = await params;
    const body = await request.json();

    const parsed = updateUserPermissionsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { grants, revokes } = parsed.data;
    const { supabase, user } = authResult;

    // Delete existing overrides for this user
    await supabase
      .from('user_permissions')
      .delete()
      .eq('user_id', userId);

    // Insert grants
    if (grants.length > 0) {
      const grantRows = grants.map((permId) => ({
        user_id: userId,
        permission_id: permId,
        granted: true,
        granted_by: user.id,
      }));

      const { error: grantError } = await supabase
        .from('user_permissions')
        .insert(grantRows);

      if (grantError) {
        return NextResponse.json(
          { error: grantError.message },
          { status: 400 }
        );
      }
    }

    // Insert revokes (deny overrides)
    if (revokes.length > 0) {
      const revokeRows = revokes.map((permId) => ({
        user_id: userId,
        permission_id: permId,
        granted: false,
        granted_by: user.id,
      }));

      const { error: revokeError } = await supabase
        .from('user_permissions')
        .insert(revokeRows);

      if (revokeError) {
        return NextResponse.json(
          { error: revokeError.message },
          { status: 400 }
        );
      }
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
