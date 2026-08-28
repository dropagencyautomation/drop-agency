import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/inbox/auth'
import { adminClient } from '@/lib/agent/admin'
import { findChats, findMessages, downloadMedia } from '@/lib/uazapi/client'
import { parseChat, parseMessage, type WaMessageInput } from '@/lib/uazapi/parse'
import { upsertChat, upsertMessages, previewFor } from '@/lib/inbox/store'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(req: NextRequest) {
  const auth = await requireUser(); if (!auth.ok) return auth.res
  const body = await req.json().catch(() => ({}))
  const perChat = Math.min(Number(body.messagesPerChat ?? 100), 500)
  const mediaSince = Date.now() - Number(body.mediaDays ?? 30) * 86400000
  const db = adminClient()
  const t0 = Date.now()
  let chats = 0, messages = 0, mediaDownloaded = 0

  for (let offset = 0; ; offset += 100) {
    const page = await findChats(offset, 100)
    for (const rawChat of page.chats) {
      const chat = parseChat(rawChat)
      if (!chat.id) continue
      const { messages: rawMsgs } = await findMessages(chat.id, 0, perChat)
      const parsed = rawMsgs.map(parseMessage).filter((m: WaMessageInput | null): m is WaMessageInput => m !== null)
      for (const m of parsed) {
        if (m.type !== 'text' && m.type !== 'other' && !m.media_url && m.wa_full_id && Date.parse(m.timestamp) >= mediaSince) {
          const dl = await downloadMedia(m.wa_full_id)
          if (dl) { m.media_url = dl.fileURL; m.media_mime = m.media_mime ?? dl.mimetype; mediaDownloaded++ }
        }
      }
      const last = parsed.reduce((a: WaMessageInput | undefined, b: WaMessageInput) => (a && a.timestamp > b.timestamp ? a : b), parsed[0])
      await upsertChat(db, chat, last ? { last_preview: previewFor(last), last_message_at: chat.last_message_at ?? last.timestamp } : {})
      await upsertMessages(db, parsed)
      chats++; messages += parsed.length
    }
    if (!page.hasMore) break
  }
  return NextResponse.json({ chats, messages, mediaDownloaded, tookMs: Date.now() - t0 })
}
