import type { WaMessageType, WaStatus } from '@/types/database'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = Record<string, any>

export interface WaChatInput { id: string; phone: string; name: string | null; avatar_url: string | null; is_group: boolean; unread_count: number; last_message_at: string | null }
export interface WaMessageInput { chat_id: string; wa_message_id: string; wa_full_id: string | null; from_me: boolean; type: WaMessageType; text: string | null; media_url: string | null; media_mime: string | null; media_name: string | null; status: WaStatus; sender_name: string | null; timestamp: string; raw: Raw }

export function phoneFromChatId(chatId: string): string {
  return String(chatId).replace(/@.*$/, '')
}

const iso = (ms: unknown) => (typeof ms === 'number' && ms > 0 ? new Date(ms).toISOString() : null)

export function parseChat(raw: Raw): WaChatInput {
  const id = String(raw.wa_chatid ?? '')
  return {
    id,
    phone: phoneFromChatId(id),
    name: raw.name || raw.wa_contactName || raw.wa_name || null,
    avatar_url: raw.imagePreview || raw.image || null,
    is_group: raw.wa_isGroup === true || id.endsWith('@g.us'),
    unread_count: typeof raw.wa_unreadCount === 'number' ? raw.wa_unreadCount : 0,
    last_message_at: iso(raw.wa_lastMsgTimestamp),
  }
}

export function mapStatus(s: unknown): WaStatus {
  const v = String(s ?? '').toLowerCase()
  if (v.includes('read') || v === 'played') return 'read'
  if (v.includes('deliver')) return 'delivered'
  if (v.includes('error') || v.includes('fail')) return 'failed'
  return 'sent'
}

const TYPE_MAP: Record<string, WaMessageType> = {
  Conversation: 'text', ExtendedTextMessage: 'text', ImageMessage: 'image', AudioMessage: 'audio',
  VideoMessage: 'video', DocumentMessage: 'document', DocumentWithCaptionMessage: 'document', StickerMessage: 'sticker',
}
const IGNORED = new Set(['ReactionMessage', 'ProtocolMessage', 'SenderKeyDistributionMessage', 'PollUpdateMessage'])

export function parseMessage(raw: Raw): WaMessageInput | null {
  const mt = String(raw.messageType ?? '')
  const waId = String(raw.messageid ?? '')
  if (!waId || IGNORED.has(mt)) return null
  const content: Raw = raw.content && typeof raw.content === 'object' ? raw.content : {}
  const type: WaMessageType = TYPE_MAP[mt] ?? 'other'
  const text = raw.text || content.caption || content.text || null
  const ts = iso(raw.messageTimestamp) ?? new Date().toISOString()
  return {
    chat_id: String(raw.chatid ?? ''),
    wa_message_id: waId,
    wa_full_id: raw.id ? String(raw.id) : null,
    from_me: raw.fromMe === true,
    type,
    text: type === 'text' || text ? text : null,
    media_url: raw.fileURL || null,
    media_mime: content.mimetype || null,
    media_name: content.fileName || content.title || null,
    status: mapStatus(raw.status),
    sender_name: raw.senderName || null,
    timestamp: ts,
    raw,
  }
}
