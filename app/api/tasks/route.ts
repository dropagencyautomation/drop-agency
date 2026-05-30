import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function getSessionUser() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

async function getUserProfile(userId: string) {
  const db = adminClient()
  const { data } = await db.from('user_profiles').select('*').eq('id', userId).single()
  return data
}

function isAdminOrGestor(profile: Record<string, unknown> | null) {
  return profile?.role === 'admin' || profile?.role === 'gestor'
}

function hasPerm(profile: Record<string, unknown> | null, key: string): boolean {
  if (!profile) return false
  if (isAdminOrGestor(profile)) return true
  const perms = (profile.permissions ?? {}) as Record<string, boolean>
  if (key in perms) return !!perms[key]
  // fallback legado
  const LEGACY: Record<string, string> = {
    tasks_view_own: 'tarefas', tasks_move: 'tarefas',
    tasks_complete: 'tarefas', tasks_comment: 'tarefas',
  }
  if (LEGACY[key] && perms[LEGACY[key]]) return true
  return false
}

// GET /api/tasks — retorna tarefas filtradas por permissão
export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const profile = await getUserProfile(user.id)
  const db = adminClient()

  if (isAdminOrGestor(profile) || hasPerm(profile, 'tasks_view_all')) {
    const { data, error } = await db.from('tasks').select('*').order('created_at', { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  // Colaborador: só tarefas onde está como responsável
  const memberId = profile?.member_id
  if (!memberId) return NextResponse.json([])

  const { data: assignees } = await db.from('task_assignees').select('task_id').eq('member_id', memberId)
  const taskIds = assignees?.map((a: { task_id: string }) => a.task_id) ?? []
  if (taskIds.length === 0) return NextResponse.json([])

  const { data, error } = await db.from('tasks').select('*').in('id', taskIds).order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/tasks — cria tarefa (requer tasks_create)
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const profile = await getUserProfile(user.id)
  if (!hasPerm(profile, 'tasks_create')) {
    return NextResponse.json({ error: 'Sem permissão para criar tarefas' }, { status: 403 })
  }

  const body = await req.json()
  const db = adminClient()
  const { data, error } = await db.from('tasks').insert({ ...body, created_by: user.id }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// PATCH /api/tasks — atualiza tarefa (verifica permissão + ownership)
export async function PATCH(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const profile = await getUserProfile(user.id)
  const body = await req.json()
  const { id, action, ...updates } = body

  if (!id) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 })

  const db = adminClient()

  // Verifica se o usuário tem acesso à tarefa
  if (!isAdminOrGestor(profile)) {
    const memberId = profile?.member_id
    if (!memberId) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

    const { data: assignee } = await db.from('task_assignees')
      .select('task_id').eq('task_id', id).eq('member_id', memberId).single()

    if (!assignee) return NextResponse.json({ error: 'Sem acesso a esta tarefa' }, { status: 403 })

    // Verifica permissão específica
    const permMap: Record<string, string> = {
      move: 'tasks_move',
      complete: 'tasks_complete',
      edit: 'tasks_edit',
      change_assignee: 'tasks_change_assignee',
      change_client: 'tasks_change_client',
      comment: 'tasks_comment',
    }
    const requiredPerm = action ? permMap[action] : 'tasks_edit'
    if (requiredPerm && !hasPerm(profile, requiredPerm)) {
      return NextResponse.json({ error: `Sem permissão: ${requiredPerm}` }, { status: 403 })
    }
  }

  const { data, error } = await db.from('tasks').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE /api/tasks — exclui tarefa (requer tasks_delete)
export async function DELETE(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const profile = await getUserProfile(user.id)
  if (!hasPerm(profile, 'tasks_delete')) {
    return NextResponse.json({ error: 'Sem permissão para excluir tarefas' }, { status: 403 })
  }

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 })

  const db = adminClient()
  await db.from('task_assignees').delete().eq('task_id', id)
  const { error } = await db.from('tasks').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
