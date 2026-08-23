import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../supabase/server';
import type { SupabaseClient, User } from '@supabase/supabase-js';

interface AuthResult {
  user: User;
  supabase: SupabaseClient;
}

interface AuthWithLevelResult extends AuthResult {
  hierarchyLevel: number;
}

interface TargetHierarchyResult {
  requesterLevel: number;
  targetLevel: number;
}

export async function requireAuth(
  _request: NextRequest
): Promise<NextResponse | AuthResult> {
  void _request;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return { user, supabase };
}

/**
 * Check if the user has a specific permission (via role or user override).
 * Uses the DB function user_has_permission().
 */
export async function requirePermission(
  request: NextRequest,
  app: string,
  action: string,
  resource?: string
): Promise<NextResponse | AuthResult> {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  const { user, supabase } = authResult;

  const { data, error } = await supabase.rpc('user_has_permission', {
    p_app: app,
    p_action: action,
    p_resource: resource ?? null,
  });

  // A failed check is not the same as a denied one. The RPC raises 42501 to mean
  // "not allowed"; anything else is a real failure and must not be reported to
  // the caller as a permission problem.
  if (error) {
    if (error.code === '42501') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    console.error('Permission check failed', {
      app,
      action,
      resource: resource ?? null,
      code: error.code,
      error: error.message,
    });
    return NextResponse.json(
      { error: 'Could not verify your permissions. Please try again.' },
      { status: 500 }
    );
  }

  if (!data) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return { user, supabase };
}

export async function getUserHierarchyLevel(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  const { data } = await supabase
    .from('user_roles')
    .select('roles(hierarchy_level)')
    .eq('user_id', userId)
    .maybeSingle();

  const rolesJoin = data?.roles as unknown as { hierarchy_level: number } | null;
  return rolesJoin?.hierarchy_level ?? 0;
}

export async function requireTargetUserBelowRequester(
  supabase: SupabaseClient,
  requesterUserId: string,
  targetUserId: string,
  action: string
): Promise<NextResponse | TargetHierarchyResult> {
  const requesterLevel = await getUserHierarchyLevel(supabase, requesterUserId);
  const targetLevel = await getUserHierarchyLevel(supabase, targetUserId);

  if (targetLevel >= requesterLevel) {
    return NextResponse.json(
      { error: `Cannot ${action} a user at or above your own level` },
      { status: 403 }
    );
  }

  return { requesterLevel, targetLevel };
}

/**
 * Check if the user meets a minimum hierarchy level.
 * Useful for admin-gated endpoints that don't map to a single permission.
 */
export async function requireMinLevel(
  request: NextRequest,
  minLevel: number
): Promise<NextResponse | AuthWithLevelResult> {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  const { user, supabase } = authResult;

  const level = await getUserHierarchyLevel(supabase, user.id);
  if (level < minLevel) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return { user, supabase, hierarchyLevel: level };
}
