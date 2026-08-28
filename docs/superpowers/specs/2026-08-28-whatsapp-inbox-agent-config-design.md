# WhatsApp Inbox + Configuração do Agente — Design

Data: 2026-08-28. Repo: drop-agency (Next.js 16, Supabase, Uazapi, OpenAI). Produção na VPS Hostinger/EasyPanel.

## Contexto

- Agente "Carol" (`lib/openai/agent.ts`) responde leads via webhook Uazapi (`app/api/webhook/whatsapp/route.ts`). Prompt, whitelist e horário são hardcoded.
- Mensagens dos leads ficam em `interactions`; estado da conversa em `ai_conversations`. Só números da whitelist são gravados. Sem mídia, sem id de mensagem, sem status.
- Páginas `/whatsapp` e `/ia` são placeholders.
- Decisão de produto (Mateus + Gabriel): cliente pode editar produtos (valores, info, fotos, novos), persona (nome, tom, estilo) e dados institucionais (horário etc.). NÃO pode editar fluxo de qualificação nem ferramentas do agente. Cuidado máximo para não quebrar o agente em produção.

## Sub-projeto B — Configuração básica do agente (fazer primeiro)

Regra (Gabriel, 2026-08-28): fluxo de qualificação e ferramentas do agente NÃO mudam. O texto do prompt fica igual; só as ocorrências literais de "Carol" viram o nome configurado, e blocos curtos são anexados ao FINAL do prompt em runtime.

Editável pelo CRM (só admin): nome do agente, horário de atendimento, informações adicionais da empresa (texto curto), catálogo de produtos (nome, descrição, valor, foto, ativo) e flag `reveal_prices` (default false: catálogo entra sem preço e regra de não revelar valores continua).

Dados: `agent_settings` (1 linha: `persona_name`, `extra_info`, `business_hours`, `reveal_prices`) + `agent_products`. Bucket `agent-products`. Leitura no webhook uma vez por request com fallback para defaults. Escrita só por API routes com service role + `audit_log`. Plano: `docs/superpowers/plans/2026-08-28-agent-config.md`.

## Sub-projeto A — Inbox WhatsApp

### Dados (migration `005_wa_inbox.sql`)

```sql
create table wa_chats (
  id text primary key,                 -- wa_chatid ex: 5511999999999@s.whatsapp.net
  phone text not null,
  name text,
  avatar_url text,
  is_group boolean not null default false,
  lead_id uuid references leads(id) on delete set null,
  agent_paused boolean not null default false,
  last_message_at timestamptz,
  last_preview text,
  unread_count int not null default 0,
  updated_at timestamptz not null default now()
);

create table wa_messages (
  id uuid primary key default gen_random_uuid(),
  chat_id text not null references wa_chats(id) on delete cascade,
  wa_message_id text unique,
  from_me boolean not null,
  type text not null default 'text',   -- text|image|audio|video|document|sticker|other
  text text,
  media_url text,
  media_mime text,
  media_name text,
  status text not null default 'sent', -- sent|delivered|read|failed
  sent_by uuid references auth.users(id),
  ai_generated boolean not null default false,
  "timestamp" timestamptz not null,
  raw jsonb,
  created_at timestamptz not null default now()
);
create index on wa_messages (chat_id, "timestamp");
alter publication supabase_realtime add table wa_chats, wa_messages;
```

RLS: autenticados leem; escrita só via service role (API routes). Storage bucket público `wa-media`.

`interactions` e `ai_conversations` continuam intocadas; Carol segue lendo `interactions`.

### Uazapi client (`lib/uazapi/client.ts`)

Adicionar: `findChats(offset, limit)` (`/chat/find`), `findMessages(chatid, limit)` (`/message/find`), `sendMedia(number, file|url, type, caption)` (`/send/media`), `downloadMedia(messageId)` (`/message/download`), `markRead(chatid)` (`/chat/read`, opcional). Nomes de endpoint confirmados na doc Uazapi v2 durante implementação; se algum não existir, feature correspondente cai para modo degradado (ex.: sem markRead).

Parser único `parseUazapiMessage(payload) → { chatId, phone, waMessageId, fromMe, type, text, mediaRef, timestamp, senderName }` em `lib/uazapi/parse.ts`, usado por webhook e sync.

### Sync inicial

`POST /api/whatsapp/sync` (admin). Pagina `/chat/find`; para cada chat, `/message/find` (limite 200, mais recentes); upsert `wa_chats` e `wa_messages` por `wa_message_id`. Mídia: baixa e sobe em `wa-media/{chatId}/{waMessageId}` — apenas para mensagens dos últimos 30 dias (limite de custo); anteriores ficam com placeholder até abrir. Botão "Sincronizar" na tela do inbox mostra progresso simples (X chats).

### Webhook

Em `route.ts`, logo após parsear:
1. Upsert `wa_chats` (nome do contato do payload, `last_message_at`, `last_preview`, `unread_count+1` se inbound).
2. Insert `wa_messages` (ignora conflito de `wa_message_id`). Mídia inbound: download → Storage → `media_url`.
3. Evento `messages_update` (status): update `wa_messages.status` por `wa_message_id`. Retorna.
4. Segue fluxo atual (whitelist, Carol). Nova checagem junto ao `human_lock`: se `wa_chats.agent_paused = true`, não responde.
5. Respostas da Carol (`sendSplitText`) retornam ids do Uazapi → também gravadas em `wa_messages` com `ai_generated = true` (eco do webhook deduplica por `wa_message_id`).

### Envio

`POST /api/whatsapp/send` — body `{ chatId, text }` ou multipart `{ chatId, file, caption }`. Chama Uazapi, grava `wa_messages` (`sent_by` = usuário, `status='sent'`), seta `wa_chats.agent_paused = true`, zera `unread_count`. `POST /api/whatsapp/chats/[id]/agent` `{ paused: boolean }` liga/desliga Carol. `POST /api/whatsapp/chats/[id]/read` zera não lidas.

### UI `/whatsapp`

Client component com supabase-js browser (Realtime em `wa_chats` e `wa_messages`).

- Esquerda (30%): busca; lista ordenada por `last_message_at`: avatar (foto ou inicial), nome/telefone, preview, hora, badge não lidas, ícone de robô quando Carol ativa.
- Direita: cabeçalho (avatar, nome, telefone, badge "Carol ativa" / "Atendimento humano" com botão alternar, link "Ver lead" se `lead_id`); área de mensagens com separadores de data, bolhas (enviadas verde `#005c4b` à direita, recebidas `#202c33` à esquerda), hora + ticks (✓ sent, ✓✓ delivered, ✓✓ azul read), mensagens da Carol com selo "IA"; render de imagem (lightbox), áudio (`<audio>`), vídeo, documento (link); composer com botão anexo (imagem/arquivo), seletor rápido de fotos de `agent_products`, textarea, Enter envia / Shift+Enter quebra.
- Fundo `#0b141a` com padrão sutil; fontes e espaçamentos próximos do WhatsApp Web.
- Abrir chat → marca lido. Scroll ancorado no fim; carrega mais ao subir (paginação 50).

## Testes

- `lib/openai/agent.test.ts`: `buildSystemPrompt` contém blocos fixos, injeta nome/produtos, funciona com settings vazios.
- `lib/uazapi/parse.test.ts`: payloads reais (texto, imagem, áudio, fromMe, status update) → objeto normalizado.
- Sem framework de teste hoje: adicionar `vitest` (dev) e script `test`.
- Webhook e Realtime só verificáveis na VPS: checklist manual pós-deploy (mensagem recebida aparece, envio pelo CRM chega no celular, Carol pausa, ✓✓ atualiza).

## Deploy

1. Rodar migrations 004 e 005 no Supabase de produção (SQL Editor ou `supabase db push`).
2. Criar buckets `agent-products` e `wa-media` (públicos).
3. Push para `main` → rebuild no EasyPanel.
4. Rodar sync inicial pela tela.

## Fora de escopo

Editar fluxo de qualificação, ferramentas, ICP, regras de handoff pela UI. Envio de mídia pelo agente. Grupos (aparecem na lista, sem resposta da Carol). Multi-instância Uazapi.
