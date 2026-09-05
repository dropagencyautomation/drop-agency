import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, adminClient, audit } from '@/lib/agent/admin'
import { loadAgentConfig } from '@/lib/agent/settings'
export const dynamic = 'force-dynamic'
const EDITABLE = ['persona_name', 'extra_info', 'business_hours', 'human_lock_minutes', 'debounce_ms'] as const

export async function GET() {
  const auth = await requireAdmin(); if (!auth.ok) return auth.res
  const admin = adminClient()
  const { settings } = await loadAgentConfig(admin)
  const { data: products } = await admin.from('agent_products').select('*').order('sort_order').order('created_at')
  return NextResponse.json({ settings, products: products ?? [] })
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(); if (!auth.ok) return auth.res
  const body = await req.json()
  const update: Record<string, unknown> = {}
  for (const k of EDITABLE) if (k in body) update[k] = body[k]
  if (typeof update.persona_name === 'string' && !update.persona_name.trim()) return NextResponse.json({ error: 'Nome obrigatório' }, { status: 400 })
  if (update.business_hours) {
    const bh = update.business_hours as { start?: unknown; end?: unknown }
    if (!Number.isInteger(bh.start) || !Number.isInteger(bh.end) || (bh.start as number) < 0 || (bh.end as number) > 24 || (bh.start as number) >= (bh.end as number)) {
      return NextResponse.json({ error: 'Horário inválido' }, { status: 400 })
    }
  }
  const range = (v: unknown, min: number, max: number) =>
    typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max
  if ('human_lock_minutes' in update && !range(update.human_lock_minutes, 1, 30 * 24 * 60)) {
    return NextResponse.json({ error: 'Pausa deve ficar entre 1 minuto e 720 horas (30 dias)' }, { status: 400 })
  }
  if ('debounce_ms' in update && !range(update.debounce_ms, 500, 30000)) {
    return NextResponse.json({ error: 'Espera deve ser de 500 a 30000 ms' }, { status: 400 })
  }
  update.updated_by = auth.userId; update.updated_at = new Date().toISOString()
  const { data, error } = await adminClient().from('agent_settings').update(update).eq('id', 1).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  await audit(auth.userId, auth.name, 'UPDATE_AGENT_SETTINGS', 'agent_settings', '1', update)
  return NextResponse.json({ settings: data })
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(); if (!auth.ok) return auth.res
  const { action } = await req.json()
  if (action !== 'reset') return NextResponse.json({ error: 'Ação inválida' }, { status: 400 })
  const reset = { persona_name: 'Carol', extra_info: '', business_hours: { start: 0, end: 24 }, human_lock_minutes: 4320, debounce_ms: 6000, updated_by: auth.userId, updated_at: new Date().toISOString() }
  const { error } = await adminClient().from('agent_settings').update(reset).eq('id', 1)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  await audit(auth.userId, auth.name, 'RESET_AGENT_SETTINGS', 'agent_settings', '1', null)
  return NextResponse.json({ success: true })
}
