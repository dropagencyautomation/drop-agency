import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/inbox/auth'
import { adminClient } from '@/lib/agent/admin'
import { sendText, sendMedia } from '@/lib/uazapi/client'
import { upsertMessages, touchChatFromMessage } from '@/lib/inbox/store'
import { pauseAgent } from '@/lib/inbox/agentLock'
import { extractSentIds } from '@/lib/inbox/sentIds'
import type { WaMessageInput } from '@/lib/uazapi/parse'

export const dynamic = 'force-dynamic'

function kind(mime: string): 'image' | 'video' | 'audio' | 'document' {
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'audio'
  return 'document'
}

export async function POST(req: NextRequest) {
  const auth = await requireUser(); if (!auth.ok) return auth.res
  const ct = req.headers.get('content-type') ?? ''
  let chatId = '', text = '', file: File | null = null
  if (ct.includes('multipart/form-data')) {
    const fd = await req.formData()
    chatId = String(fd.get('chatId') ?? ''); text = String(fd.get('caption') ?? ''); file = fd.get('file') as File | null
  } else {
    const b = await req.json().catch(() => ({})); chatId = String(b.chatId ?? ''); text = String(b.text ?? '')
  }
  if (!chatId) return NextResponse.json({ error: 'chatId obrigatório' }, { status: 400 })
  if (chatId.endsWith('@g.us')) return NextResponse.json({ error: 'Envio para grupos não suportado' }, { status: 400 })
  if (!file && !text.trim()) return NextResponse.json({ error: 'Mensagem vazia' }, { status: 400 })
  if (file && file.size > 16 * 1024 * 1024) return NextResponse.json({ error: 'Máximo 16MB' }, { status: 400 })

  const phone = chatId.replace(/@.*$/, '')
  const db = adminClient()

  let res: Record<string, unknown>
  let input: WaMessageInput
  const now = new Date().toISOString()
  try {
    if (file) {
      const b64 = Buffer.from(await file.arrayBuffer()).toString('base64')
      const type = kind(file.type)
      res = await sendMedia(phone, type, `data:${file.type};base64,${b64}`, text || undefined, type === 'document' ? file.name : undefined, type === 'audio' ? { ptt: true } : undefined)
      input = { chat_id: chatId, wa_message_id: '', wa_full_id: null, from_me: true, type, text: text || null, media_url: null, media_mime: file.type, media_name: type === 'document' ? file.name : null, status: 'sent', sender_name: null, timestamp: now, raw: res }
    } else {
      res = await sendText(phone, text.trim())
      input = { chat_id: chatId, wa_message_id: '', wa_full_id: null, from_me: true, type: 'text', text: text.trim(), media_url: null, media_mime: null, media_name: null, status: 'sent', sender_name: null, timestamp: now, raw: res }
    }
  } catch (e) {
    console.error('[INBOX] envio falhou', phone, e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Falha ao enviar' }, { status: 502 })
  }

  // Só pausa a Carol depois que o envio deu certo — envio que falhou não é atendimento humano.
  await pauseAgent(phone)

  const { fullId, waMessageId } = extractSentIds(res)
  if (!waMessageId) {
    // ponytail: sem id não inventamos um — o eco do webhook grava a linha com o id real.
    console.warn('[INBOX] envio sem id na resposta da Uazapi, deixando para o eco do webhook', JSON.stringify(res).slice(0, 300))
    return NextResponse.json({ message: null })
  }
  input.wa_full_id = fullId
  input.wa_message_id = waMessageId
  // /send/media responde com a URL do arquivo em content.URL (verificado); fileURL fica como fallback
  if (file) input.media_url = ((res as { content?: { URL?: string } }).content?.URL) || ((res as { fileURL?: string }).fileURL) || null

  await upsertMessages(db, [input], { sent_by: auth.userId })
  await touchChatFromMessage(db, input)
  const { data: message } = await db.from('wa_messages').select('*').eq('wa_message_id', input.wa_message_id).maybeSingle()
  return NextResponse.json({ message })
}
