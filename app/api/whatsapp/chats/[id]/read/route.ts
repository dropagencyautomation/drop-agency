import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/inbox/auth'
import { adminClient } from '@/lib/agent/admin'
import { markRead } from '@/lib/uazapi/client'

export const dynamic = 'force-dynamic'

export async function POST(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(); if (!auth.ok) return auth.res
  const id = decodeURIComponent((await params).id)
  await adminClient().from('wa_chats').update({ unread_count: 0 }).eq('id', id)
  if (!id.endsWith('@g.us')) await markRead(id.replace(/@.*$/, ''))
  return NextResponse.json({ ok: true })
}
