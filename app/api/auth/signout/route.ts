import { NextResponse } from 'next/server';
import { createClient } from '@/app/lib/supabase/server';

export async function POST() {
  const supabase = await createClient();
  await supabase.auth.signOut();

  return NextResponse.json({ success: true });
}
