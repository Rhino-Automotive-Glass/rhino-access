import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/app/lib/rbac/apiMiddleware';
import { UserRole } from '@/app/lib/rbac/types';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const authResult = await requireRole(request, ['admin']);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  try {
    const { userId } = await params;
    const body = await request.json();
    const { role } = body as { role: UserRole };

    if (!['admin', 'qa', 'viewer'].includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

    const { supabase, user } = authResult;

    const { error } = await supabase.from('user_roles').upsert({
      user_id: userId,
      role: role,
      assigned_by: user.id,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'user_id'
    });

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
