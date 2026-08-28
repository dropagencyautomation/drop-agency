# Inbox WhatsApp (sub-projeto A) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tela `/whatsapp` idêntica ao WhatsApp Web: todos os chats do número da Drop, histórico, mídia, ✓✓, envio de texto/arquivo pelo CRM, pausa/retomada da Carol por chat, tempo real.

**Architecture:** Supabase é o espelho (`wa_chats`, `wa_messages`, Realtime ligado); Uazapi é a fonte. Import inicial por `/chat/find` + `/message/find`. Um **segundo webhook** na Uazapi (`/api/webhook/inbox`, eventos de mensagem + atualização de status, sem exclusões) alimenta o espelho — o webhook da Carol (`/api/webhook/whatsapp`) não muda. Pausar a Carol num chat = gravar a chave Redis `human_lock:{phone}` que o webhook dela já respeita; retomar = apagar a chave. Envio pelo CRM chama Uazapi, grava a mensagem e pausa a Carol.

**Tech Stack:** Next.js 16 App Router, React 19, supabase-js (Realtime no browser), ioredis, Uazapi v2, Vitest.

## Global Constraints

- `lib/openai/agent.ts` e `app/api/webhook/whatsapp/route.ts`: NÃO tocar. `interactions` e `ai_conversations`: NÃO tocar.
- Formatos reais da Uazapi (verificados em 2026-08-28 na instância `dropagency.uazapi.com`, header `token`):
  - `POST /chat/find` body `{ limit, offset, sort: '-wa_lastMsgTimestamp' }` → `{ chats: Chat[], pagination, totalChatsStats }`. Chat: `wa_chatid` (`NUM@s.whatsapp.net` ou `ID@g.us`), `name`, `wa_contactName`, `phone`, `imagePreview`, `wa_isGroup`, `wa_unreadCount`, `wa_lastMsgTimestamp` (ms), `wa_lastMessageType`, `wa_archived`.
  - `POST /message/find` body `{ chatid, limit, offset }` → `{ messages: Msg[], hasMore, nextOffset, offset, limit }`. Msg: `id` (`OWNER:MSGID`), `messageid`, `chatid`, `fromMe`, `messageType` (`Conversation`, `ExtendedTextMessage`, `ImageMessage`, `AudioMessage`, `VideoMessage`, `DocumentMessage`, `StickerMessage`, `ReactionMessage`, …), `text`, `fileURL` (vazio até baixar), `content` (objeto; para mídia tem `mimetype`, `URL`, `fileLength`, `seconds`, `PTT`; para documento `fileName`/`title`), `messageTimestamp` (ms), `senderName`, `sender_pn`, `status` (`''`, `Delivered`, `Read`, `Played`, `Deleted`), `isGroup`.
  - `POST /message/download` body `{ id }` (o `id` completo `OWNER:MSGID`) → `{ fileURL, mimetype }` (URL pública em `/files/…`).
  - `POST /send/text` body `{ number, text, delay }` (já usado). `POST /send/media` body `{ number, type: 'image'|'video'|'audio'|'document', file: <URL ou base64 data URI>, text?: caption, docName? }` — validado só até "Missing number"; confirmar nomes na Task 2 com um envio real para o `ADMIN_PHONE`.
  - `POST /chat/read` body `{ number }`.
  - Webhook: `GET /webhook` lista; `POST /webhook` cria `{ url, events: [...], excludeMessages: [], enabled: true }`. Envelope do evento de mensagem: `body.EventType === 'messages'`, `body.message` = Msg acima, `body.chat` = Chat. Nome do evento de status e formato do payload: descobrir na Task 4 (handler loga `EventType` desconhecido).
- Telefone do lead = `wa_chatid` sem sufixo. Chats de grupo (`@g.us`) aparecem na lista, mas o envio pelo CRM e o toggle da Carol ficam desabilitados neles.
- Mídia: guardar `fileURL` da Uazapi direto em `media_url` (sem re-upload). Se um dia expirar, trocar por Storage (`// ponytail:` no código).
- Redis: chave `human_lock:{phone}` (TTL 30 dias para pausa manual; o webhook da Carol renova para 900 s quando humano responde do celular — mantém). Não usar outra chave.
- Estilo: inline styles, paleta WhatsApp Web dark: fundo lista `#111b21`, cabeçalho/composer `#202c33`, fundo chat `#0b141a`, bolha enviada `#005c4b`, bolha recebida `#202c33`, texto `#e9edef`, secundário `#8696a0`, verde `#00a884`, tick azul `#53bdeb`. Fonte herdada do app.
- Só usuários autenticados; sem gate de admin (qualquer atendente usa). Rotas de escrita usam service role via `adminClient()` de `lib/agent/admin.ts` e exigem sessão válida (`createClient().auth.getUser()`).
- Commits em português.

---

### Task 1: Migration, tipos e parser de payload Uazapi

**Files:**
- Create: `supabase/migrations/005_wa_inbox.sql`
- Modify: `types/database.ts` (append)
- Create: `lib/uazapi/parse.ts`
- Test: `lib/uazapi/parse.test.ts`

**Interfaces:**
- Produces: tipos `WaChat`, `WaMessage`, `WaMessageType`, `WaStatus`; `parseChat(raw): WaChatInput`; `parseMessage(raw): WaMessageInput | null` (null para tipos irrelevantes: reação, protocolo, vazio); `phoneFromChatId(chatId): string`; `mapStatus(raw): WaStatus`.

- [ ] **Step 1: Migration**

```sql
create table if not exists wa_chats (
  id text primary key,
  phone text not null,
  name text,
  avatar_url text,
  is_group boolean not null default false,
  lead_id uuid references leads(id) on delete set null,
  last_message_at timestamptz,
  last_preview text,
  unread_count int not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists wa_messages (
  id uuid primary key default gen_random_uuid(),
  chat_id text not null references wa_chats(id) on delete cascade,
  wa_message_id text not null unique,
  wa_full_id text,
  from_me boolean not null,
  type text not null default 'text',
  text text,
  media_url text,
  media_mime text,
  media_name text,
  status text not null default 'sent',
  sent_by uuid references auth.users(id),
  ai_generated boolean not null default false,
  sender_name text,
  "timestamp" timestamptz not null,
  raw jsonb,
  created_at timestamptz not null default now()
);
create index if not exists wa_messages_chat_ts on wa_messages (chat_id, "timestamp");
create index if not exists wa_chats_last on wa_chats (last_message_at desc);

alter table wa_chats enable row level security;
alter table wa_messages enable row level security;
drop policy if exists "auth read wa_chats" on wa_chats;
create policy "auth read wa_chats" on wa_chats for select to authenticated using (true);
drop policy if exists "auth read wa_messages" on wa_messages;
create policy "auth read wa_messages" on wa_messages for select to authenticated using (true);

do $$ begin
  alter publication supabase_realtime add table wa_chats;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table wa_messages;
exception when duplicate_object then null; end $$;
```

- [ ] **Step 2: Tipos** (append em `types/database.ts`)

```ts
export type WaMessageType = 'text' | 'image' | 'audio' | 'video' | 'document' | 'sticker' | 'other'
export type WaStatus = 'sent' | 'delivered' | 'read' | 'failed'

export interface WaChat {
  id: string
  phone: string
  name: string | null
  avatar_url: string | null
  is_group: boolean
  lead_id: string | null
  last_message_at: string | null
  last_preview: string | null
  unread_count: number
  updated_at: string
}

export interface WaMessage {
  id: string
  chat_id: string
  wa_message_id: string
  wa_full_id: string | null
  from_me: boolean
  type: WaMessageType
  text: string | null
  media_url: string | null
  media_mime: string | null
  media_name: string | null
  status: WaStatus
  sent_by: string | null
  ai_generated: boolean
  sender_name: string | null
  timestamp: string
  raw: unknown
  created_at: string
}
```

- [ ] **Step 3: Teste do parser**

`lib/uazapi/parse.test.ts` — fixtures copiadas dos formatos reais acima:

```ts
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
```

- [ ] **Step 4: Rodar, ver falhar** — `npm test` → "Cannot find module './parse'".

- [ ] **Step 5: Implementar `lib/uazapi/parse.ts`**

```ts
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
```

- [ ] **Step 6: Rodar, ver passar** — `npm test` → todos passam. `npx tsc --noEmit` limpo.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/005_wa_inbox.sql types/database.ts lib/uazapi/parse.ts lib/uazapi/parse.test.ts
git commit -m "feat: tabelas do inbox WhatsApp, tipos e parser de payload Uazapi"
```

---

### Task 2: Client Uazapi (chats, mensagens, mídia, read) + store do espelho

**Files:**
- Modify: `lib/uazapi/client.ts` (append; não alterar funções existentes)
- Create: `lib/inbox/store.ts`
- Test: `lib/inbox/store.test.ts`

**Interfaces:**
- Produces (client): `findChats(offset: number, limit: number): Promise<{ chats: Raw[]; hasMore: boolean }>`, `findMessages(chatid: string, offset: number, limit: number): Promise<{ messages: Raw[]; hasMore: boolean; nextOffset: number }>`, `downloadMedia(fullId: string): Promise<{ fileURL: string; mimetype: string } | null>`, `sendMedia(number: string, type: 'image'|'video'|'audio'|'document', file: string, caption?: string, docName?: string): Promise<Raw>`, `markRead(number: string): Promise<void>`.
- Produces (store): `upsertChat(db, chat: WaChatInput, patch?: Partial<WaChat>)`, `upsertMessages(db, msgs: WaMessageInput[], extra?: { sent_by?: string; ai_generated?: boolean })` (ignora conflito de `wa_message_id`), `touchChatFromMessage(db, msg: WaMessageInput)` (atualiza `last_message_at`, `last_preview`, `unread_count+1` se inbound), `updateStatus(db, waMessageId: string, status: WaStatus)`, `previewFor(msg): string` (texto ou `📷 Foto`, `🎤 Áudio`, `🎥 Vídeo`, `📄 Documento`, `Figurinha`).

- [ ] **Step 1: Client** — append em `lib/uazapi/client.ts`:

```ts
export async function findChats(offset = 0, limit = 100) {
  const r = await request('/chat/find', { offset, limit, sort: '-wa_lastMsgTimestamp' })
  const chats = Array.isArray(r?.chats) ? r.chats : []
  return { chats, hasMore: chats.length === limit }
}

export async function findMessages(chatid: string, offset = 0, limit = 200) {
  const r = await request('/message/find', { chatid, offset, limit })
  return { messages: Array.isArray(r?.messages) ? r.messages : [], hasMore: Boolean(r?.hasMore), nextOffset: Number(r?.nextOffset ?? offset + limit) }
}

export async function downloadMedia(fullId: string): Promise<{ fileURL: string; mimetype: string } | null> {
  try {
    const r = await request('/message/download', { id: fullId })
    return r?.fileURL ? { fileURL: r.fileURL, mimetype: r.mimetype ?? '' } : null
  } catch (e) { console.error('[UAZAPI] download falhou', fullId, e); return null }
}

export async function sendMedia(number: string, type: 'image' | 'video' | 'audio' | 'document', file: string, caption?: string, docName?: string) {
  return request('/send/media', { number, type, file, text: caption ?? '', docName })
}

export async function markRead(number: string) {
  try { await request('/chat/read', { number }) } catch (e) { console.error('[UAZAPI] chat/read falhou', number, e) }
}
```

Confirmar nomes do `/send/media` com um envio real para `ADMIN_PHONE` (`curl -X POST $UAZAPI_BASE_URL/send/media -H "token: $UAZAPI_TOKEN" -d '{"number":"5511989869931","type":"image","file":"https://upload.wikimedia.org/wikipedia/commons/4/47/PNG_transparency_demonstration_1.png","text":"teste CRM"}'`). Se o campo de legenda for `caption` em vez de `text`, ajustar aqui e anotar no report.

- [ ] **Step 2: Teste do store**

```ts
import { describe, it, expect } from 'vitest'
import { previewFor } from './store'

describe('previewFor', () => {
  it('texto vira preview cortado', () => {
    expect(previewFor({ type: 'text', text: 'a'.repeat(120) } as never)).toHaveLength(80)
  })
  it('mídia vira rótulo', () => {
    expect(previewFor({ type: 'image', text: null } as never)).toBe('📷 Foto')
    expect(previewFor({ type: 'image', text: 'legenda' } as never)).toBe('📷 legenda')
    expect(previewFor({ type: 'audio', text: null } as never)).toBe('🎤 Áudio')
    expect(previewFor({ type: 'document', text: null, media_name: 'x.pdf' } as never)).toBe('📄 x.pdf')
  })
})
```

- [ ] **Step 3: Implementar `lib/inbox/store.ts`**

```ts
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
```

- [ ] **Step 4:** `npm test` passa; `npx tsc --noEmit` limpo.

- [ ] **Step 5: Commit** — `git commit -m "feat: client Uazapi para chats/mensagens/mídia e store do espelho"`

---

### Task 3: Sync inicial `/api/whatsapp/sync`

**Files:**
- Create: `lib/inbox/auth.ts`
- Create: `app/api/whatsapp/sync/route.ts`

**Interfaces:**
- `requireUser(): Promise<{ ok: true; userId: string } | { ok: false; res: NextResponse }>` (qualquer autenticado).
- `POST /api/whatsapp/sync` body `{ messagesPerChat?: number (default 100), mediaDays?: number (default 30) }` → `{ chats: number, messages: number, mediaDownloaded: number, tookMs }`. `export const maxDuration = 300`.

- [ ] **Step 1: `lib/inbox/auth.ts`**

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function requireUser() {
  const ssr = await createClient()
  const { data: { user } } = await ssr.auth.getUser()
  if (!user) return { ok: false as const, res: NextResponse.json({ error: 'Não autenticado' }, { status: 401 }) }
  return { ok: true as const, userId: user.id }
}
```

- [ ] **Step 2: Sync route**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/inbox/auth'
import { adminClient } from '@/lib/agent/admin'
import { findChats, findMessages, downloadMedia } from '@/lib/uazapi/client'
import { parseChat, parseMessage } from '@/lib/uazapi/parse'
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
      const parsed = rawMsgs.map(parseMessage).filter((m): m is NonNullable<typeof m> => m !== null)
      for (const m of parsed) {
        if (m.type !== 'text' && m.type !== 'other' && !m.media_url && m.wa_full_id && Date.parse(m.timestamp) >= mediaSince) {
          const dl = await downloadMedia(m.wa_full_id)
          if (dl) { m.media_url = dl.fileURL; m.media_mime = m.media_mime ?? dl.mimetype; mediaDownloaded++ }
        }
      }
      const last = parsed.reduce((a, b) => (a && a.timestamp > b.timestamp ? a : b), parsed[0])
      await upsertChat(db, chat, last ? { last_preview: previewFor(last), last_message_at: chat.last_message_at ?? last.timestamp } : {})
      await upsertMessages(db, parsed)
      chats++; messages += parsed.length
    }
    if (!page.hasMore) break
  }
  return NextResponse.json({ chats, messages, mediaDownloaded, tookMs: Date.now() - t0 })
}
```

- [ ] **Step 3: Rodar localmente** — dev server ligado, logado no browser. No console do browser: `fetch('/api/whatsapp/sync',{method:'POST'}).then(r=>r.json()).then(console.log)`. Esperado: `chats > 0`, `messages > 0`. Conferir no Supabase: `select count(*) from wa_messages`. (Sync funciona local: Uazapi e Supabase são públicos.)

- [ ] **Step 4: Commit** — `git commit -m "feat: sincronização inicial de chats e mensagens da Uazapi"`

---

### Task 4: Webhook do espelho `/api/webhook/inbox` + registro na Uazapi

**Files:**
- Create: `app/api/webhook/inbox/route.ts`
- Create: `scripts/register-inbox-webhook.ts`

**Interfaces:**
- `POST /api/webhook/inbox` — sem auth (Uazapi chama); valida `?secret=` igual a `WEBHOOK_SECRET`. Sempre responde `{ ok: true }`.
- Script: registra webhook `{ url: `${NEXT_PUBLIC_APP_URL}/api/webhook/inbox?secret=${WEBHOOK_SECRET}`, events: ['messages', 'messages_update'], excludeMessages: [], enabled: true }` via `POST ${UAZAPI_BASE_URL}/webhook`, idempotente (lista antes com `GET /webhook`, não duplica pela URL).

- [ ] **Step 1: Route**

```ts
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
  const db = adminClient()
  const event = String(body.EventType ?? body.event ?? body.type ?? '').toLowerCase()
  try {
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
```

- [ ] **Step 2: Script de registro** (`scripts/register-inbox-webhook.ts`, rodar com `npx tsx scripts/register-inbox-webhook.ts` após `set -a; source .env.local`; instale `tsx` como devDependency se não houver)

```ts
const base = process.env.UAZAPI_BASE_URL!, token = process.env.UAZAPI_TOKEN!
const url = `${process.env.NEXT_PUBLIC_APP_URL}/api/webhook/inbox?secret=${process.env.WEBHOOK_SECRET}`
const h = { 'Content-Type': 'application/json', token }
async function main() {
  const list = await fetch(`${base}/webhook`, { headers: h }).then(r => r.json())
  if (Array.isArray(list) && list.some((w: { url?: string }) => w.url === url)) { console.log('já registrado'); return }
  const r = await fetch(`${base}/webhook`, { method: 'POST', headers: h, body: JSON.stringify({ url, events: ['messages', 'messages_update'], excludeMessages: [], enabled: true }) })
  console.log(r.status, await r.text())
}
main()
```
Se a Uazapi rejeitar `messages_update`, tentar `['messages', 'messages_update', 'chats']` → depois só `['messages']` e anotar no report que status ficará por polling futuro.

- [ ] **Step 3: Teste local do handler** — `curl -s -X POST "http://localhost:3000/api/webhook/inbox?secret=$(grep WEBHOOK_SECRET .env.local|cut -d= -f2)" -H 'content-type: application/json' -d '{"EventType":"messages","message":{"id":"o:T1","messageid":"T1","chatid":"5511999999999@s.whatsapp.net","fromMe":false,"messageType":"Conversation","text":"teste","messageTimestamp":1787928964000,"senderName":"Teste","status":""}}'` → `{ok:true}` e linha em `wa_messages`. Depois apagar: `delete from wa_chats where id='5511999999999@s.whatsapp.net'`. Sem secret → `{ok:true}` sem gravar.

- [ ] **Step 4: Commit** — `git commit -m "feat: webhook do inbox WhatsApp e script de registro na Uazapi"`

---

### Task 5: Envio, pausa da Carol e leitura

**Files:**
- Create: `app/api/whatsapp/send/route.ts`
- Create: `app/api/whatsapp/chats/[id]/agent/route.ts`
- Create: `app/api/whatsapp/chats/[id]/read/route.ts`
- Create: `lib/inbox/agentLock.ts`

**Interfaces:**
- `POST /api/whatsapp/send` JSON `{ chatId, text }` ou multipart `chatId`, `file`, `caption?` → `{ message: WaMessage }`. Recusa grupos (400).
- `POST /api/whatsapp/chats/[id]/agent` `{ paused: boolean }` → `{ paused }`. `GET` → `{ paused }`.
- `POST /api/whatsapp/chats/[id]/read` → `{ ok: true }` (zera `unread_count`, chama `markRead`).
- `agentLock`: `pauseAgent(phone)` = `redis.set('human_lock:'+phone,'1','EX',2592000)`; `resumeAgent(phone)` = `del`; `isAgentPaused(phone)` = `exists`. Tudo em try/catch (Redis fora → `paused=false`, loga).

- [ ] **Step 1: agentLock**

```ts
import { getRedis } from '@/lib/redis/client'
const KEY = (phone: string) => `human_lock:${phone}` // mesma chave que o webhook da Carol já respeita
const MONTH = 30 * 24 * 3600

export async function pauseAgent(phone: string) { try { await getRedis().set(KEY(phone), '1', 'EX', MONTH) } catch (e) { console.error('[INBOX] pauseAgent', e) } }
export async function resumeAgent(phone: string) { try { await getRedis().del(KEY(phone)) } catch (e) { console.error('[INBOX] resumeAgent', e) } }
export async function isAgentPaused(phone: string) { try { return (await getRedis().exists(KEY(phone))) === 1 } catch { return false } }
```

- [ ] **Step 2: send**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/inbox/auth'
import { adminClient } from '@/lib/agent/admin'
import { sendText, sendMedia } from '@/lib/uazapi/client'
import { upsertMessages, touchChatFromMessage } from '@/lib/inbox/store'
import { pauseAgent } from '@/lib/inbox/agentLock'
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
  await pauseAgent(phone)

  let res: Record<string, unknown>
  let input: WaMessageInput
  const now = new Date().toISOString()
  if (file) {
    const b64 = Buffer.from(await file.arrayBuffer()).toString('base64')
    const type = kind(file.type)
    res = await sendMedia(phone, type, `data:${file.type};base64,${b64}`, text || undefined, type === 'document' ? file.name : undefined)
    input = { chat_id: chatId, wa_message_id: '', wa_full_id: null, from_me: true, type, text: text || null, media_url: null, media_mime: file.type, media_name: type === 'document' ? file.name : null, status: 'sent', sender_name: null, timestamp: now, raw: res }
  } else {
    res = await sendText(phone, text.trim())
    input = { chat_id: chatId, wa_message_id: '', wa_full_id: null, from_me: true, type: 'text', text: text.trim(), media_url: null, media_mime: null, media_name: null, status: 'sent', sender_name: null, timestamp: now, raw: res }
  }
  // resposta da Uazapi traz o id da mensagem; formatos vistos: { id: 'OWNER:MSGID' } ou { messageid }
  const fullId = String((res as { id?: string }).id ?? '')
  input.wa_full_id = fullId || null
  input.wa_message_id = String((res as { messageid?: string }).messageid ?? fullId.replace(/^.*:/, '') ?? '') || `crm-${Date.now()}`
  // /send/media responde com a URL do arquivo em content.URL (verificado); fileURL fica como fallback
  if (file) input.media_url = ((res as { content?: { URL?: string } }).content?.URL) || ((res as { fileURL?: string }).fileURL) || null

  await upsertMessages(db, [input], { sent_by: auth.userId })
  await touchChatFromMessage(db, input)
  const { data: message } = await db.from('wa_messages').select('*').eq('wa_message_id', input.wa_message_id).maybeSingle()
  return NextResponse.json({ message })
}
```

Nota: `sendText` já seta `bot:sending:{phone}` no Redis (15 s) — efeito colateral inofensivo aqui (o webhook da Carol exclui mensagens da API de qualquer forma).

- [ ] **Step 3: agent + read routes**

`app/api/whatsapp/chats/[id]/agent/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/inbox/auth'
import { pauseAgent, resumeAgent, isAgentPaused } from '@/lib/inbox/agentLock'

export const dynamic = 'force-dynamic'
const phoneOf = (id: string) => decodeURIComponent(id).replace(/@.*$/, '')

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(); if (!auth.ok) return auth.res
  const { id } = await params
  return NextResponse.json({ paused: await isAgentPaused(phoneOf(id)) })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(); if (!auth.ok) return auth.res
  const { id } = await params
  if (decodeURIComponent(id).endsWith('@g.us')) return NextResponse.json({ error: 'Grupo' }, { status: 400 })
  const { paused } = await req.json()
  if (paused) await pauseAgent(phoneOf(id)); else await resumeAgent(phoneOf(id))
  return NextResponse.json({ paused: Boolean(paused) })
}
```

`app/api/whatsapp/chats/[id]/read/route.ts`:
```ts
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
```

- [ ] **Step 4:** `npx tsc --noEmit`, `npm run lint` nos arquivos novos. Smoke sem cookie: `curl -s -o /dev/null -w '%{http_code}' -X POST localhost:3000/api/whatsapp/send` → 401.

- [ ] **Step 5: Commit** — `git commit -m "feat: envio pelo CRM, pausa/retomada da Carol e marcar lido"`

---

### Task 6: UI `/whatsapp` (WhatsApp Web)

**Files:**
- Modify: `app/(crm)/whatsapp/page.tsx`
- Create: `app/(crm)/whatsapp/Inbox.tsx` (estado, realtime, layout 2 colunas)
- Create: `app/(crm)/whatsapp/ChatList.tsx`
- Create: `app/(crm)/whatsapp/Conversation.tsx` (cabeçalho, mensagens, composer)
- Create: `app/(crm)/whatsapp/MessageBubble.tsx`

**Interfaces:**
- Consumes: tabelas `wa_chats`/`wa_messages` via `createClient()` de `lib/supabase/client.ts` (browser, RLS leitura), rotas da Task 3/5.
- Page (server): busca `wa_chats` ordenado por `last_message_at desc` (limit 300) e passa para `Inbox`. Sem Topbar (a tela ocupa 100% como WhatsApp Web).

- [ ] **Step 1: page.tsx**

```tsx
import { createClient } from '@/lib/supabase/server'
import type { WaChat } from '@/types/database'
import Inbox from './Inbox'

export const dynamic = 'force-dynamic'

export default async function WhatsAppPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: chats } = await supabase.from('wa_chats').select('*').order('last_message_at', { ascending: false, nullsFirst: false }).limit(300)
  return <Inbox initialChats={(chats ?? []) as WaChat[]} userId={user!.id} />
}
```

- [ ] **Step 2: Inbox.tsx** — client. Estado: `chats`, `activeId`, `messages` (do chat ativo), `agentPaused`, `search`, `syncing`. Efeitos:
  - Realtime: `supabase.channel('inbox').on('postgres_changes', { event: '*', schema: 'public', table: 'wa_chats' }, upsert em `chats` e reordena).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'wa_messages' }, se `chat_id === activeId` → append; se `from_me === false && chat_id !== activeId` nada, o `wa_chats` já traz `unread_count`).on(..., { event: 'UPDATE', table: 'wa_messages' }, atualiza `status` da mensagem na lista).subscribe()`.
  - Ao selecionar chat: `supabase.from('wa_messages').select('*').eq('chat_id', id).order('timestamp', { ascending: false }).limit(50)` → inverte; `fetch('/api/whatsapp/chats/'+encodeURIComponent(id)+'/read', { method: 'POST' })`; `fetch(.../agent)` → `agentPaused`.
  - "Carregar anteriores": query com `.lt('timestamp', primeiro.timestamp)`.
  - Botão "Sincronizar" (canto da lista): `POST /api/whatsapp/sync` → mostra `X chats, Y msgs`; depois recarrega `wa_chats`.
  - Layout: `display:grid; gridTemplateColumns: '30% 1fr'; height: '100%'`; esquerda `background:#111b21; borderRight:'1px solid #222d34'`; direita `background:#0b141a`. Sem chat ativo: tela vazia central com ícone e "Selecione uma conversa" (cinza `#8696a0`).

- [ ] **Step 3: ChatList.tsx** — props `{ chats, activeId, search, onSearch, onSelect, onSync, syncing }`. Cabeçalho `#202c33` com título "Conversas" e botão sync (ícone ↻). Campo de busca (`#202c33`, borda arredondada, placeholder "Pesquisar ou começar uma nova conversa"). Lista: cada item 72px, `padding: '10px 16px'`, avatar 49px redondo (`avatar_url` ou inicial em círculo `#6a7175`), nome `#e9edef` 17px, hora à direita `#8696a0` 12px (hoje → `HH:mm`, ontem → "Ontem", senão `dd/MM/yyyy`), preview `#8696a0` 14px elipse, badge verde `#00a884` com `unread_count`. Ativo: `background:#2a3942`; hover `#202c33`. Filtro por `search` em nome/telefone.

- [ ] **Step 4: Conversation.tsx** — props `{ chat, messages, agentPaused, onToggleAgent, onSend, onLoadMore, userId }`.
  - Cabeçalho `#202c33` 60px: avatar, nome, telefone (`#8696a0`); à direita badge `Carol ativa` (verde) / `Atendimento humano` (âmbar `#ffb02e`) com botão de alternar; se `chat.lead_id` link "Ver lead" → `/leads` (ou `/crm`), ícone. Em grupo: sem badge, sem composer (texto "Envio para grupos indisponível").
  - Área de mensagens: `overflowY:auto; padding: '12px 8%'`, fundo `#0b141a` com padrão sutil (`backgroundImage: radial-gradient(#ffffff08 1px, transparent 1px); backgroundSize: 24px 24px`). Separadores de data (chip `#182229`, texto `#8696a0`, "HOJE"/"ONTEM"/`dd/MM/yyyy`). Botão "Carregar anteriores" no topo. Scroll ancorado no fim ao trocar de chat e quando chega mensagem nova enquanto o usuário está no fim.
  - Composer `#202c33`, da esquerda para a direita: botão emoji (😊) que abre um painel flutuante acima do composer com grade de ~80 emojis comuns (constante no código, sem lib; clique insere na posição do cursor da textarea); botão anexo (📎 → `<input type=file hidden>`, aceita imagem/vídeo/áudio/pdf/doc); textarea auto-height 1–5 linhas (`#2a3942`, sem borda, `#e9edef`); à direita, se a textarea estiver vazia e sem arquivo → botão microfone (🎤), senão → botão enviar (➤ verde). Enter envia, Shift+Enter quebra. Preview do arquivo selecionado com nome e botão ✕ antes de enviar. Enquanto envia: desabilita.
  - Gravação de áudio: clique no 🎤 pede permissão e inicia `MediaRecorder` (`audio/webm;codecs=opus`, fallback `audio/ogg`, fallback default); mostra cronômetro vermelho `mm:ss` e botões ✕ (cancela) e ➤ (para e envia). Ao parar, monta `File` (`voice-<timestamp>.webm`, tipo do recorder) e envia pelo mesmo `POST /api/whatsapp/send` multipart. Sem permissão/API indisponível → `alert('Microfone indisponível')`.
  - Ajuste na Task 5 (`send/route.ts`, já commitada): quando `type === 'audio'`, passar também `ptt: true` no body do `/send/media` para chegar como mensagem de voz — `sendMedia` ganha parâmetro opcional `opts?: { ptt?: boolean }` que espalha no body. Verificar na Task 7 que um webm/opus gravado no Chrome chega como áudio de voz no celular; se a Uazapi recusar webm, converter no servidor está fora de escopo — anotar e cair para envio como documento.

- [ ] **Step 5: MessageBubble.tsx** — props `{ m: WaMessage }`. Alinhamento: `from_me` direita, bolha `#005c4b`; recebida esquerda `#202c33`. `maxWidth: 65%`, `borderRadius: 8`, `padding: '6px 8px 8px'`, sombra `0 1px .5px #0b141a`. Conteúdo por tipo: `text` (pre-wrap, links clicáveis simples); `image` (`<img>` `maxWidth:330`, clique abre em nova aba, legenda abaixo); `video` (`<video controls>`); `audio` (`<audio controls>`); `document` (cartão com ícone 📄, nome, link download); `sticker` (img 160px sem bolha); `other` ("Mensagem não suportada"). Rodapé: `sender_name` em grupo (cor por hash), hora `HH:mm` `#ffffff99` 11px, ticks só em `from_me`: `sent` ✓ cinza, `delivered` ✓✓ cinza, `read` ✓✓ `#53bdeb`, `failed` ⚠ vermelho. Selo "IA" pequeno (`#00a884` borda) quando `ai_generated`; "Você"/nome do atendente quando `sent_by` (mostra só "CRM").

- [ ] **Step 6: Verificar** — `npx tsc --noEmit`, lint limpo nos arquivos. No browser (logado): lista carrega; abrir chat mostra histórico; enviar texto aparece na hora com ✓; badge "Atendimento humano" ativa após enviar; alternar volta "Carol ativa"; anexar imagem envia. Realtime: rodar o curl da Task 4 Step 3 com o chat aberto → mensagem aparece sem recarregar.

- [ ] **Step 7: Commit** — `git commit -m "feat: inbox WhatsApp estilo WhatsApp Web com tempo real, envio e controle da Carol"`

---

### Task 7: Deploy e validação

- [ ] Rodar `supabase/migrations/005_wa_inbox.sql` no SQL Editor de produção.
- [ ] Merge → main → push → rebuild EasyPanel.
- [ ] Registrar webhook: no EasyPanel abrir console do serviço ou rodar local com `.env.local` apontando `NEXT_PUBLIC_APP_URL` para a URL de produção: `npx tsx scripts/register-inbox-webhook.ts`. Conferir `GET /webhook` mostra 2 entradas.
- [ ] No CRM prod: `/whatsapp` → Sincronizar. Conferir chats e histórico.
- [ ] Do celular de teste (whitelist): mandar mensagem → aparece no CRM em tempo real; Carol responde e a resposta aparece com selo IA.
- [ ] Do CRM: responder → chega no celular; badge muda para "Atendimento humano"; Carol não responde à próxima mensagem do lead; alternar → Carol volta.
- [ ] Mandar foto e áudio do celular → renderizam. Enviar imagem pelo CRM → chega.
- [ ] Logs do serviço: procurar `[INBOX] evento ignorado` / `status payload desconhecido` → ajustar nome do evento de status se necessário (fix rápido no handler).
- [ ] Atualizar spec com "Implementado em <data>, commit <hash>".
