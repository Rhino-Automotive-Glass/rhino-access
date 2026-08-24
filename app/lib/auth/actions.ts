'use server'

import { createClient } from '@/app/lib/supabase/server'
import { getSiteUrl } from '@/app/lib/auth/siteUrl'
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

export async function signUp(email: string, password: string) {
  const supabase = await createClient()

  const siteUrl = getSiteUrl()

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${siteUrl}/api/auth/confirm?type=signup`,
    },
  })

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/', 'layout')
  return { success: true }
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/login')
}
