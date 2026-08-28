import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/inbox/auth'
import { adminClient } from '@/lib/agent/admin'
import { findChats, findMessages, downloadMedia } from '@/lib/uazapi/client'
import { parseChat, parseMessage, type WaMessageInput } from '@/lib/uazapi/parse'
import { upsertChat, upsertMessages, previewFor } from '@/lib/inbox/store'
import { getRedis } from '@/lib/redis/client'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const LOCK = 'inbox:sync:lock'
const MAX_PAGES = 50

export async function POST(req: NextRequest) {
  const auth = await requireUser(); if (!auth.ok) return auth.res
  const body = await req.json().catch(() => ({}))
  const perChat = Math.min(Number(body.messagesPerChat ?? 100), 500)
  const mediaSince = Date.now() - Number(body.mediaDays ?? 30) * 86400000

  // ponytail: trava global — é uma instância só de WhatsApp, um sync por vez basta.
  // Redis fora do ar não bloqueia o sync: segue sem trava.
  let locked = false
  try {
    locked = (await getRedis().set(LOCK, '1', 'EX', 600, 'NX')) === 'OK'
    if (!locked) return NextResponse.json({ error: 'Sincronização já em andamento' }, { status: 409 })
  } catch (e) {
    console.error('[INBOX] lock de sync indisponível, seguindo sem trava', e)
  }

  try {
    const db = adminClient()
    const t0 = Date.now()
    let chats = 0, messages = 0, mediaDownloaded = 0
    let prevFirstId: string | null = null

    for (let page = 0, offset = 0; page < MAX_PAGES; page++, offset += 100) {
      const { chats: rawChats, hasMore } = await findChats(offset, 100)
      // Fim real, ou a Uazapi ignorou o offset e repetiu a mesma página.
      if (rawChats.length === 0) break
      const firstId = String(rawChats[0]?.wa_chatid ?? '')
      if (prevFirstId !== null && firstId === prevFirstId) break
      prevFirstId = firstId

      for (const rawChat of rawChats) {
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
      if (!hasMore) break
    }
    return NextResponse.json({ chats, messages, mediaDownloaded, tookMs: Date.now() - t0 })
  } finally {
    if (locked) { try { await getRedis().del(LOCK) } catch (e) { console.error('[INBOX] del lock de sync', e) } }
  }
}
