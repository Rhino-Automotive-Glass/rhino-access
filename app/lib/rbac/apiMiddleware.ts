import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../supabase/server';
import { UserRole } from './types';

export async function requireAuth(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return { user, supabase };
}

export async function requireRole(
  request: NextRequest,
  allowedRoles: UserRole[]
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { user, supabase } = authResult;

  const { data: roleData, error: roleError } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single();

  if (roleError || !roleData) {
    const userRole = 'viewer' as UserRole;
    if (!allowedRoles.includes(userRole)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    return { user, supabase, role: userRole };
  }

  const userRole = roleData.role as UserRole;
  if (!allowedRoles.includes(userRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return { user, supabase, role: userRole };
}

export async function getUserRole(
  userId: string,
  supabase: any
): Promise<UserRole> {
  const { data, error } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    return 'viewer';
  }

  return data.role as UserRole;
}
