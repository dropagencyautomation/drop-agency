import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, adminClient } from '@/lib/agent/admin'

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(); if (!auth.ok) return auth.res
  const form = await req.formData()
  const file = form.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'file obrigatório' }, { status: 400 })
  if (!file.type.startsWith('image/')) return NextResponse.json({ error: 'Apenas imagens' }, { status: 400 })
  if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: 'Máximo 5MB' }, { status: 400 })
  const supabase = adminClient()
  const { data: buckets } = await supabase.storage.listBuckets()
  if (!buckets?.some(b => b.name === 'agent-products')) {
    await supabase.storage.createBucket('agent-products', { public: true, fileSizeLimit: 5242880 })
  }
  const ext = file.name.split('.').pop() ?? 'jpg'
  const path = `${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from('agent-products').upload(path, await file.arrayBuffer(), { contentType: file.type })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const { data: { publicUrl } } = supabase.storage.from('agent-products').getPublicUrl(path)
  return NextResponse.json({ url: publicUrl })
}
