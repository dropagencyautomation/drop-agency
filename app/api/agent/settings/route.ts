import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, adminClient, audit } from '@/lib/agent/admin'
import { loadAgentConfig } from '@/lib/agent/settings'
export const dynamic = 'force-dynamic'
const EDITABLE = ['persona_name', 'extra_info', 'business_hours'] as const

export async function GET() {
  const auth = await requireAdmin(); if (!auth.ok) return auth.res
  const { settings, products } = await loadAgentConfig(adminClient())
  return NextResponse.json({ settings, products })
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
  const reset = { persona_name: 'Carol', extra_info: '', business_hours: { start: 8, end: 19 }, updated_by: auth.userId, updated_at: new Date().toISOString() }
  const { error } = await adminClient().from('agent_settings').update(reset).eq('id', 1)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  await audit(auth.userId, auth.name, 'RESET_AGENT_SETTINGS', 'agent_settings', '1', null)
  return NextResponse.json({ success: true })
}
