import { createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const userId = formData.get('userId') as string | null

    if (!file || !userId) {
      return NextResponse.json({ error: 'file e userId são obrigatórios' }, { status: 400 })
    }

    const supabase = await createServiceClient()

    // Cria o bucket se não existir
    const { data: buckets } = await supabase.storage.listBuckets()
    const bucketExists = buckets?.some(b => b.name === 'avatars')
    if (!bucketExists) {
      await supabase.storage.createBucket('avatars', { public: true, fileSizeLimit: 5242880 })
    }

    const ext = file.name.split('.').pop() ?? 'jpg'
    const path = `${userId}/avatar.${ext}`
    const buffer = await file.arrayBuffer()

    const { error: upErr } = await supabase.storage
      .from('avatars')
      .upload(path, buffer, { contentType: file.type, upsert: true })

    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 })
    }

    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)

    await supabase.from('user_profiles').update({ avatar_url: publicUrl }).eq('id', userId)

    return NextResponse.json({ publicUrl })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
