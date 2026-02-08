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

export async function requireAuth(
  _request: NextRequest
): Promise<NextResponse | AuthResult> {
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

  if (error || !data) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return { user, supabase };
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

  const { data } = await supabase
    .from('user_roles')
    .select('role_id, roles(hierarchy_level)')
    .eq('user_id', user.id)
    .single();

  const rolesJoin = data?.roles as unknown as { hierarchy_level: number } | null;
  const level = rolesJoin?.hierarchy_level ?? 0;
  if (level < minLevel) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return { user, supabase, hierarchyLevel: level };
}
