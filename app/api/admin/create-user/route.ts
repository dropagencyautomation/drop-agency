import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/agent/admin'

export const dynamic = 'force-dynamic'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Auto-cadastro pela tela de login: nunca vira admin e nunca escolhe permissões.
const SELF_REGISTER_PERMISSIONS = {
  dashboard: true, crm: true, clientes: true, tarefas: true, projetos: true,
  marketing: false, equipe: false, financeiro: false, integracoes: false, configuracoes: false, administracao: false,
}

export async function POST(req: NextRequest) {
  try {
    const admin = getAdmin()
    const body = await req.json()
    const { name, email, password, member_id } = body
    if (!email || !password || !name) return NextResponse.json({ error: 'Campos obrigatórios ausentes' }, { status: 400 })

    // Só um admin autenticado define role/permissions. Sem sessão de admin, o
    // pedido é tratado como auto-cadastro: colaborador com permissões padrão,
    // ignorando o que vier no corpo (esta rota era pública e aceitava role=admin).
    const caller = await requireAdmin()
    const role = caller.ok ? (body.role ?? 'colaborador') : 'colaborador'
    const permissions = caller.ok ? (body.permissions ?? SELF_REGISTER_PERMISSIONS) : SELF_REGISTER_PERMISSIONS
    if (!caller.ok && (body.role && body.role !== 'colaborador')) {
      console.warn('[ADMIN] auto-cadastro tentou role %s para %s — rebaixado para colaborador', body.role, email)
    }

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
  const caller = await requireAdmin()
  if (!caller.ok) return caller.res
  try {
    const admin = getAdmin()
    const { id, role, permissions, is_active } = await req.json()
    const update: Record<string, unknown> = {}
    if (role !== undefined) update.role = role
    if (permissions !== undefined) update.permissions = permissions
    if (is_active !== undefined) update.is_active = is_active
    const { error } = await admin.from('user_profiles').update(update).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    await admin.from('audit_log').insert({ user_id: caller.userId, user_name: caller.name, action: 'UPDATE_USER', resource: 'user_profiles', resource_id: id, details: update })
    return NextResponse.json({ success: true })
  } catch { return NextResponse.json({ error: 'Erro interno' }, { status: 500 }) }
}
