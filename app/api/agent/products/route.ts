import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, adminClient, audit } from '@/lib/agent/admin'

export const dynamic = 'force-dynamic'
const FIELDS = ['name', 'description', 'price', 'photo_url', 'is_active', 'sort_order'] as const

function pick(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {}
  for (const k of FIELDS) if (k in body) out[k] = body[k]
  return out
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(); if (!auth.ok) return auth.res
  const body = pick(await req.json())
  if (typeof body.name !== 'string' || !body.name.trim()) return NextResponse.json({ error: 'Nome obrigatório' }, { status: 400 })
  const { data, error } = await adminClient().from('agent_products').insert(body).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  await audit(auth.userId, auth.name, 'CREATE_AGENT_PRODUCT', 'agent_products', data.id, body)
  return NextResponse.json({ product: data })
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(); if (!auth.ok) return auth.res
  const { id, ...rest } = await req.json()
  if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })
  const body = { ...pick(rest), updated_at: new Date().toISOString() }
  const { data, error } = await adminClient().from('agent_products').update(body).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  await audit(auth.userId, auth.name, 'UPDATE_AGENT_PRODUCT', 'agent_products', id, body)
  return NextResponse.json({ product: data })
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(); if (!auth.ok) return auth.res
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })
  const { error } = await adminClient().from('agent_products').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  await audit(auth.userId, auth.name, 'DELETE_AGENT_PRODUCT', 'agent_products', id, null)
  return NextResponse.json({ success: true })
}
