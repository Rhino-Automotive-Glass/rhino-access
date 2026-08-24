'use server'

import { createClient } from '@/app/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function signIn(email: string, password: string) {
  const supabase = await createClient()

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/', 'layout')
  redirect('/')
}

// No signUp action: access is invite-only. Accounts are created by an admin via
// POST /api/admin/users/invite, and "Allow new users to sign up" is disabled in
// Supabase Auth. Re-adding self-serve signup means revisiting what role the
// on_auth_user_created trigger assigns — it currently grants `viewer`, which
// carries `view` on every child app.

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/login')
}
