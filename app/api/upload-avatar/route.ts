import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

// Cliente admin puro — sem cookie/session, usa service role que bypassa RLS
function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const userId = formData.get('userId') as string | null

    if (!file || !userId) {
      return NextResponse.json({ error: 'file e userId são obrigatórios' }, { status: 400 })
    }

    const supabase = adminClient()

    // Cria o bucket se não existir
    const { data: buckets } = await supabase.storage.listBuckets()
    const bucketExists = buckets?.some(b => b.name === 'avatars')
    if (!bucketExists) {
      const { error: bucketErr } = await supabase.storage.createBucket('avatars', {
        public: true,
        fileSizeLimit: 5242880,
      })
      if (bucketErr && !bucketErr.message.includes('already exists')) {
        return NextResponse.json({ error: bucketErr.message }, { status: 500 })
      }
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
