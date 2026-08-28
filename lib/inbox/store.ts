import type { SupabaseClient } from '@supabase/supabase-js'
import type { WaChat, WaStatus } from '@/types/database'
import type { WaChatInput, WaMessageInput } from '@/lib/uazapi/parse'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>

export function previewFor(m: Pick<WaMessageInput, 'type' | 'text'> & { media_name?: string | null }): string {
  const t = (m.text ?? '').replace(/\s+/g, ' ').trim()
  switch (m.type) {
    case 'text': return t.slice(0, 80)
    case 'image': return t ? `📷 ${t}`.slice(0, 80) : '📷 Foto'
    case 'video': return t ? `🎥 ${t}`.slice(0, 80) : '🎥 Vídeo'
    case 'audio': return '🎤 Áudio'
    case 'document': return `📄 ${m.media_name ?? t ?? 'Documento'}`.slice(0, 80)
    case 'sticker': return 'Figurinha'
    default: return t || 'Mensagem'
  }
}

export async function upsertChat(db: Db, chat: WaChatInput, patch: Partial<WaChat> = {}) {
  const { data: lead } = chat.is_group ? { data: null } : await db.from('leads').select('id').eq('phone', chat.phone).maybeSingle()
  const row = { ...chat, ...patch, lead_id: patch.lead_id ?? lead?.id ?? null, updated_at: new Date().toISOString() }
  const { error } = await db.from('wa_chats').upsert(row, { onConflict: 'id' })
  if (error) console.error('[INBOX] upsertChat', chat.id, error.message)
}

export async function ensureChat(db: Db, chatId: string, name?: string | null) {
  const { data } = await db.from('wa_chats').select('id').eq('id', chatId).maybeSingle()
  if (data) return
  await upsertChat(db, { id: chatId, phone: chatId.replace(/@.*$/, ''), name: name ?? null, avatar_url: null, is_group: chatId.endsWith('@g.us'), unread_count: 0, last_message_at: null })
}

export async function upsertMessages(db: Db, msgs: WaMessageInput[], extra: { sent_by?: string; ai_generated?: boolean } = {}) {
  if (msgs.length === 0) return
  const rows = msgs.map(m => ({ ...m, ...extra }))
  const { error } = await db.from('wa_messages').upsert(rows, { onConflict: 'wa_message_id', ignoreDuplicates: true })
  if (error) console.error('[INBOX] upsertMessages', error.message)
}

export async function touchChatFromMessage(db: Db, m: WaMessageInput) {
  const { data: chat } = await db.from('wa_chats').select('unread_count,last_message_at').eq('id', m.chat_id).maybeSingle()
  if (chat?.last_message_at && chat.last_message_at > m.timestamp) return
  await db.from('wa_chats').update({
    last_message_at: m.timestamp,
    last_preview: previewFor(m),
    unread_count: m.from_me ? (chat?.unread_count ?? 0) : (chat?.unread_count ?? 0) + 1,
    updated_at: new Date().toISOString(),
  }).eq('id', m.chat_id)
}

export async function updateStatus(db: Db, waMessageId: string, status: WaStatus) {
  const rank: Record<WaStatus, number> = { failed: 0, sent: 1, delivered: 2, read: 3 }
  const { data } = await db.from('wa_messages').select('status').eq('wa_message_id', waMessageId).maybeSingle()
  if (!data || rank[status] <= rank[data.status as WaStatus]) return
  await db.from('wa_messages').update({ status }).eq('wa_message_id', waMessageId)
}
