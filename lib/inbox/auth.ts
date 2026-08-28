import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function requireUser() {
  const ssr = await createClient()
  const { data: { user } } = await ssr.auth.getUser()
  if (!user) return { ok: false as const, res: NextResponse.json({ error: 'Não autenticado' }, { status: 401 }) }
  return { ok: true as const, userId: user.id }
}
