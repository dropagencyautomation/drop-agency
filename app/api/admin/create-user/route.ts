import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export async function POST(req: NextRequest) {
  try {
    const { name, email, password, role, member_id, permissions } = await req.json()
    if (!email || !password || !name) return NextResponse.json({ error: 'Campos obrigatórios ausentes' }, { status: 400 })

    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
    })
    if (authError || !authData.user) return NextResponse.json({ error: authError?.message ?? 'Erro ao criar usuário' }, { status: 400 })

    const { error: profileError } = await admin.from('user_profiles').insert({
      id: authData.user.id, name, email, role: role ?? 'colaborador',
      member_id: member_id || null, permissions,
    })
    if (profileError) {
      await admin.auth.admin.deleteUser(authData.user.id)
      return NextResponse.json({ error: profileError.message }, { status: 400 })
    }

    await admin.from('audit_log').insert({ action: 'CREATE_USER', resource: 'user_profiles', resource_id: authData.user.id, details: { name, email, role } })
    return NextResponse.json({ success: true })
  } catch { return NextResponse.json({ error: 'Erro interno' }, { status: 500 }) }
}

export async function PATCH(req: NextRequest) {
  try {
    const { id, role, permissions, is_active } = await req.json()
    const update: Record<string, unknown> = {}
    if (role !== undefined) update.role = role
    if (permissions !== undefined) update.permissions = permissions
    if (is_active !== undefined) update.is_active = is_active
    const { error } = await admin.from('user_profiles').update(update).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    await admin.from('audit_log').insert({ action: 'UPDATE_USER', resource: 'user_profiles', resource_id: id, details: update })
    return NextResponse.json({ success: true })
  } catch { return NextResponse.json({ error: 'Erro interno' }, { status: 500 }) }
}
