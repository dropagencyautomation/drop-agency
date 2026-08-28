import { describe, it, expect } from 'vitest'
import { parseChat, parseMessage, phoneFromChatId, mapStatus } from './parse'

const rawChat = { wa_chatid: '554187490574@s.whatsapp.net', name: 'Luca', wa_contactName: 'Luca Vespa', phone: '554187490574', imagePreview: 'https://x/y.jpg', wa_isGroup: false, wa_unreadCount: 3, wa_lastMsgTimestamp: 1787928964000, wa_lastMessageType: 'Conversation' }
const rawText = { id: '5511989869931:3AB0D2846AD8B003FD65', messageid: '3AB0D2846AD8B003FD65', chatid: '554187490574@s.whatsapp.net', fromMe: false, messageType: 'ExtendedTextMessage', text: 'Vamos resolver já', fileURL: '', content: { text: 'Vamos resolver já' }, messageTimestamp: 1787928964000, senderName: 'Luca Vespa', status: '' }
const rawImage = { ...rawText, id: '5511989869931:IMG1', messageid: 'IMG1', messageType: 'ImageMessage', text: '', fileURL: 'https://dropagency.uazapi.com/files/a.jpg', content: { mimetype: 'image/jpeg', caption: 'olha' }, fromMe: true, status: 'Read' }
const rawDoc = { ...rawText, id: 'o:DOC1', messageid: 'DOC1', messageType: 'DocumentMessage', content: { mimetype: 'application/pdf', fileName: 'proposta.pdf' } }
const rawReaction = { ...rawText, id: 'o:R1', messageid: 'R1', messageType: 'ReactionMessage', text: '' }

describe('phoneFromChatId', () => {
  it('remove sufixo', () => {
    expect(phoneFromChatId('554187490574@s.whatsapp.net')).toBe('554187490574')
    expect(phoneFromChatId('120363430107511766@g.us')).toBe('120363430107511766')
  })
})

describe('parseChat', () => {
  it('mapeia campos', () => {
    expect(parseChat(rawChat)).toEqual({
      id: '554187490574@s.whatsapp.net', phone: '554187490574', name: 'Luca', avatar_url: 'https://x/y.jpg',
      is_group: false, unread_count: 3, last_message_at: new Date(1787928964000).toISOString(),
    })
  })
  it('usa wa_contactName quando name vazio e nulls quando faltam', () => {
    const c = parseChat({ wa_chatid: '5511@s.whatsapp.net', name: '', wa_contactName: 'Fulano' })
    expect(c.name).toBe('Fulano'); expect(c.avatar_url).toBeNull(); expect(c.unread_count).toBe(0); expect(c.last_message_at).toBeNull()
  })
})

describe('parseMessage', () => {
  it('texto', () => {
    const m = parseMessage(rawText)!
    expect(m).toMatchObject({ chat_id: '554187490574@s.whatsapp.net', wa_message_id: '3AB0D2846AD8B003FD65', wa_full_id: '5511989869931:3AB0D2846AD8B003FD65', from_me: false, type: 'text', text: 'Vamos resolver já', media_url: null, status: 'sent', sender_name: 'Luca Vespa' })
    expect(m.timestamp).toBe(new Date(1787928964000).toISOString())
  })
  it('imagem com legenda e status lido', () => {
    const m = parseMessage(rawImage)!
    expect(m).toMatchObject({ type: 'image', media_url: 'https://dropagency.uazapi.com/files/a.jpg', media_mime: 'image/jpeg', text: 'olha', status: 'read', from_me: true })
  })
  it('documento pega nome do arquivo', () => {
    expect(parseMessage(rawDoc)).toMatchObject({ type: 'document', media_name: 'proposta.pdf', media_mime: 'application/pdf' })
  })
  it('reação é ignorada', () => {
    expect(parseMessage(rawReaction)).toBeNull()
  })
  it('sem messageid é ignorada', () => {
    expect(parseMessage({ ...rawText, messageid: '' })).toBeNull()
  })
})

describe('mapStatus', () => {
  it('mapeia valores da Uazapi', () => {
    expect(mapStatus('Delivered')).toBe('delivered'); expect(mapStatus('Read')).toBe('read'); expect(mapStatus('Played')).toBe('read')
    expect(mapStatus('')).toBe('sent'); expect(mapStatus('Deleted')).toBe('sent'); expect(mapStatus('DELIVERY_ACK')).toBe('delivered'); expect(mapStatus('READ')).toBe('read')
  })
})
