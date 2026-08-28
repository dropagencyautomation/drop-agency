import { NextResponse } from 'next/server'
import { createClient as createSsr } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

export function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function requireAdmin() {
  const ssr = await createSsr()
  const { data: { user } } = await ssr.auth.getUser()
  if (!user) return { ok: false as const, res: NextResponse.json({ error: 'Não autenticado' }, { status: 401 }) }
  const { data: profile } = await adminClient().from('user_profiles').select('role,name,is_active').eq('id', user.id).single()
  if (!profile || !profile.is_active || profile.role !== 'admin') {
    return { ok: false as const, res: NextResponse.json({ error: 'Somente administradores' }, { status: 403 }) }
  }
  return { ok: true as const, userId: user.id, name: profile.name as string }
}

export async function audit(userId: string, userName: string, action: string, resource: string, resourceId: string | null, details: unknown) {
  await adminClient().from('audit_log').insert({ user_id: userId, user_name: userName, action, resource, resource_id: resourceId, details })
}
