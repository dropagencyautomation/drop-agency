import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/agent/admin'
import { parseMessage, parseChat, mapStatus } from '@/lib/uazapi/parse'
import { upsertChat, ensureChat, upsertMessages, touchChatFromMessage, updateStatus } from '@/lib/inbox/store'
import { downloadMedia } from '@/lib/uazapi/client'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  if (req.nextUrl.searchParams.get('secret') !== process.env.WEBHOOK_SECRET) return NextResponse.json({ ok: true })
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ ok: true })
  const event = String(body.EventType ?? body.event ?? body.type ?? '').toLowerCase()
  try {
    const db = adminClient()
    if (event === 'messages') {
      const raw = body.message ?? body.data ?? body
      const m = parseMessage(raw)
      if (!m || !m.chat_id) return NextResponse.json({ ok: true })
      if (m.type !== 'text' && m.type !== 'other' && !m.media_url && m.wa_full_id) {
        const dl = await downloadMedia(m.wa_full_id)
        if (dl) { m.media_url = dl.fileURL; m.media_mime = m.media_mime ?? dl.mimetype }
      }
      if (body.chat?.wa_chatid) await upsertChat(db, parseChat(body.chat))
      else await ensureChat(db, m.chat_id, m.from_me ? null : m.sender_name)
      // fromMe sem sent_by = veio da Carol (API) ou do celular; marcamos como IA quando wasSentByApi
      const ai = m.from_me && (raw.wasSentByApi === true || raw.source === 'api')
      await upsertMessages(db, [m], { ai_generated: ai })
      await touchChatFromMessage(db, m)
    } else if (event.includes('update') || event.includes('ack') || event.includes('status')) {
      const u = body.message ?? body.data ?? body
      const id = String(u.messageid ?? u.id ?? '').replace(/^.*:/, '')
      const st = u.status ?? u.ack ?? u.update?.status
      if (id && st !== undefined) await updateStatus(db, id, mapStatus(st))
      else console.log('[INBOX] status payload desconhecido', JSON.stringify(body).slice(0, 500))
    } else {
      console.log('[INBOX] evento ignorado', event, JSON.stringify(body).slice(0, 300))
    }
  } catch (e) { console.error('[INBOX] erro', e) }
  return NextResponse.json({ ok: true })
}
