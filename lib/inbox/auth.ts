import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/agent/admin'

export async function requireUser() {
  const ssr = await createClient()
  const { data: { user } } = await ssr.auth.getUser()
  if (!user) return { ok: false as const, res: NextResponse.json({ error: 'Não autenticado' }, { status: 401 }) }
  // Perfil ausente é permitido (usuário legado); só bloqueia quem foi desativado de fato.
  const { data: profile } = await adminClient().from('user_profiles').select('is_active').eq('id', user.id).maybeSingle()
  if (profile && profile.is_active === false) return { ok: false as const, res: NextResponse.json({ error: 'Conta desativada' }, { status: 403 }) }
  return { ok: true as const, userId: user.id }
}
