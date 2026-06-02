import { NextRequest, NextResponse } from 'next/server';
import {
  requirePermission,
  requireTargetUserBelowRequester,
} from '@/app/lib/rbac/apiMiddleware';
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
      const { fieldErrors, formErrors } = parsed.error.flatten();
      return NextResponse.json(
        {
          error:
            formErrors[0] ??
            fieldErrors.grants?.[0] ??
            fieldErrors.revokes?.[0] ??
            fieldErrors,
        },
        { status: 400 }
      );
    }

    const { grants, revokes } = parsed.data;
    const { supabase, user } = authResult;

    const hierarchyResult = await requireTargetUserBelowRequester(
      supabase,
      user.id,
      userId,
      'update permissions for'
    );
    if (hierarchyResult instanceof NextResponse) return hierarchyResult;

    const { error } = await supabase.rpc('replace_user_permission_overrides', {
      p_user_id: userId,
      p_grants: grants,
      p_revokes: revokes,
    });

    if (error) {
      return NextResponse.json(
        { error: error.message },
        {
          status:
            error.code === '42501' ? 403 : error.code === 'P0002' ? 404 : 400,
        }
      );
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
