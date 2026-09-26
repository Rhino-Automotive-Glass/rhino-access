'use server'

import { createClient } from '@/app/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

// Sign-in happens in the browser through LoginForm from
// @rhino-automotive-glass/auth-ui (see app/(auth)/login/page.tsx).

// This app has no signUp action. Admins invite users through
// POST /api/admin/users/invite and assign their role there. Production removed
// on_auth_user_created; accounts created directly remain without a role until
// an admin assigns one.

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/login')
}
