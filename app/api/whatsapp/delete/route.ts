import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/inbox/auth'
import { adminClient } from '@/lib/agent/admin'
import { deleteMessage } from '@/lib/uazapi/client'

export const dynamic = 'force-dynamic'

// "Uazapi error: 404 {"error":"Message not found"}" — formato do helper request
const ERR_RE = /^Uazapi error: (\d{3}) ([\s\S]*)$/

function fromUazapi(raw: string): { status: number; error: string } {
  const m = ERR_RE.exec(raw)
  if (!m) return { status: 502, error: 'Falha ao apagar no WhatsApp' }
  const status = Number(m[1])
  if (status === 404) return { status, error: 'Mensagem não encontrada no WhatsApp' }
  let error = m[2].trim()
  try {
    const parsed = JSON.parse(error) as { error?: string; message?: string }
    error = parsed.error ?? parsed.message ?? error
  } catch { /* corpo não é JSON: repassa o texto cru */ }
  return { status: status >= 400 && status <= 599 ? status : 502, error: error || 'Falha ao apagar no WhatsApp' }
}

export async function POST(req: NextRequest) {
  const auth = await requireUser(); if (!auth.ok) return auth.res
  const b = await req.json().catch(() => ({}))
  const waMessageId = String(b.waMessageId ?? '')
  if (!waMessageId) return NextResponse.json({ error: 'waMessageId obrigatório' }, { status: 400 })

  const db = adminClient()
  const { data: row } = await db.from('wa_messages').select('wa_message_id,wa_full_id,from_me').eq('wa_message_id', waMessageId).maybeSingle()
  if (!row) return NextResponse.json({ error: 'Mensagem não encontrada' }, { status: 404 })
  if (!row.from_me) return NextResponse.json({ error: 'Só é possível apagar mensagens enviadas pela Drop' }, { status: 400 })

  try {
    await deleteMessage(row.wa_full_id || row.wa_message_id)
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e)
    console.error('[INBOX] apagar falhou', waMessageId, raw)
    const { status, error } = fromUazapi(raw)
    return NextResponse.json({ error }, { status })
  }

  // Revogada no WhatsApp: marca a linha em vez de apagar, para o histórico não sumir.
  const { data: message, error } = await db.from('wa_messages')
    .update({ deleted_at: new Date().toISOString(), deleted_by: auth.userId })
    .eq('wa_message_id', waMessageId).select('*').maybeSingle()
  if (error) console.error('[INBOX] marcar revogada falhou', waMessageId, error.message)
  return NextResponse.json({ message })
}
