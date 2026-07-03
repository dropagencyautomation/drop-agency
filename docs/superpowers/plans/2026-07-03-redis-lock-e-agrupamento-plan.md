# Redis: Lock Humano + Agrupamento de Mensagens — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Usar Redis para (1) travar a IA por 15 minutos quando um humano responde manualmente pelo WhatsApp conectado, e (2) agrupar mensagens do lead enviadas em sequência numa janela de 30s, substituindo o debounce atual baseado em `setTimeout` + releitura do Supabase.

**Architecture:** Cliente Redis singleton (`ioredis`) em `lib/redis/client.ts`. Uma flag `bot:sending:{phone}` com TTL marca quando o próprio bot está enviando, para o webhook distinguir eco do bot de mensagem humana real. `human_lock:{phone}` (TTL 900s) trava a IA. `latest_msg:{phone}` (TTL 60s, valor = timestamp) substitui a checagem via Supabase para saber se uma mensagem mais nova chegou durante a espera de 30s.

**Tech Stack:** TypeScript, Next.js, `ioredis`. Nenhuma mudança de schema no Supabase.

## Global Constraints

- Spec de referência: `docs/superpowers/specs/2026-07-03-redis-lock-e-agrupamento-design.md`
- Identificador usado nas chaves do Redis: `phone` (número puro, sem `@s.whatsapp.net`), o mesmo valor já usado como `whatsapp_number` no Supabase — não usar o formato `wa_chatid` nas chaves Redis, para manter consistência com o resto do código.
- Requer `REDIS_URL` configurado em `.env.local` para os testes de conectividade e para rodar o webhook localmente contra Redis de verdade (Redis vai rodar na VPS Easypanel do usuário).
- Sem framework de testes no projeto — os testes de função pura usam scripts `tsx` (mesmo padrão de `scripts/replay-test1.ts`); a verificação do fluxo do webhook (integração com Redis/Supabase/uazapi reais) é manual, via `npm run dev` + `curl` simulando payloads da uazapi.

---

### Task 1: Cliente Redis singleton

**Files:**
- Create: `lib/redis/client.ts`
- Modify: `package.json` (adicionar dependência `ioredis`)
- Modify: `.env.local.example` (adicionar `REDIS_URL`)
- Test: `scripts/test-redis-connection.ts` (novo)

**Interfaces:**
- Produces: `getRedis(): Redis` (instância `ioredis` singleton, cacheada em `globalThis` para não abrir conexões demais em hot-reload do Next.js dev).

- [ ] **Step 1: Instalar a dependência**

```bash
npm install ioredis
```

- [ ] **Step 2: Criar `lib/redis/client.ts`**

```ts
import Redis from 'ioredis'

declare global {
  // eslint-disable-next-line no-var
  var __redis: Redis | undefined
}

export function getRedis(): Redis {
  if (!global.__redis) {
    global.__redis = new Redis(process.env.REDIS_URL!)
  }
  return global.__redis
}
```

- [ ] **Step 3: Adicionar `REDIS_URL` ao `.env.local.example`**

No arquivo `.env.local.example`, adicionar uma nova seção:

```
REDIS_URL=redis://default:senha@host:porta
```

- [ ] **Step 4: Escrever o teste de conectividade**

Criar `scripts/test-redis-connection.ts`:

```ts
// Testa a conexao com o Redis configurado em REDIS_URL (SET/GET com EX).
//
// Uso: npx tsx scripts/test-redis-connection.ts
// Requer REDIS_URL em drop-agency/.env.local

import 'dotenv/config'
import { getRedis } from '../lib/redis/client'

async function main() {
  const redis = getRedis()
  await redis.set('healthcheck:test', 'ok', 'EX', 10)
  const value = await redis.get('healthcheck:test')
  if (value !== 'ok') throw new Error(`esperado 'ok', recebido '${value}'`)
  console.log('OK - conexao com Redis funcionando, SET/GET/EX ok')
  await redis.quit()
}

main().catch((err) => {
  console.error('FALHOU:', err)
  process.exit(1)
})
```

- [ ] **Step 5: Rodar o teste (requer `REDIS_URL` real em `.env.local`)**

Run: `npx tsx scripts/test-redis-connection.ts`
Expected: `OK - conexao com Redis funcionando, SET/GET/EX ok`

Se `REDIS_URL` ainda não estiver disponível (Redis na VPS Easypanel ainda não provisionado), pular este step por ora e retomar antes de ir para produção — os demais tasks podem ser implementados e revisados por código sem uma conexão real, mas não podem ser verificados ponta a ponta sem ela.

- [ ] **Step 6: Commit**

```bash
git add lib/redis/client.ts package.json package-lock.json .env.local.example scripts/test-redis-connection.ts
git commit -m "feat: adiciona cliente redis singleton"
```

---

### Task 2: Flag "bot enviando" antes de mandar mensagem

**Files:**
- Modify: `lib/uazapi/client.ts` (função `sendSplitText`)
- Test: `scripts/test-split-blocks.ts` (estender, já criado na Frente 1)

**Interfaces:**
- Consumes: `getRedis()` de `lib/redis/client.ts`
- Produces: `botSendingTtlSeconds(blockCount: number): number` (exportada), usada pelo TTL da flag `bot:sending:{phone}`.

- [ ] **Step 1: Escrever o teste da função de TTL (vai falhar, função não existe)**

Adicionar ao final de `scripts/test-split-blocks.ts`:

```ts
import { botSendingTtlSeconds } from '../lib/uazapi/client'

assert.equal(botSendingTtlSeconds(1), 15)
assert.equal(botSendingTtlSeconds(3), 25)

console.log('OK - botSendingTtlSeconds calculado corretamente')
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx tsx scripts/test-split-blocks.ts`
Expected: erro de import (`botSendingTtlSeconds` não existe em `lib/uazapi/client.ts`)

- [ ] **Step 3: Implementar `botSendingTtlSeconds` e usar em `sendSplitText`**

Em `lib/uazapi/client.ts`, adicionar o import no topo do arquivo:

```ts
import { getRedis } from '@/lib/redis/client'
```

Adicionar, antes de `export async function sendSplitText`:

```ts
/**
 * TTL (segundos) da flag "bot enviando" para um número: cobre o tempo
 * estimado de envio de todos os blocos (delay de digitação + pausas entre
 * blocos) mais uma margem de segurança para o eco do webhook chegar.
 */
export function botSendingTtlSeconds(blockCount: number): number {
  return blockCount * 5 + 10
}
```

Substituir `sendSplitText` (hoje):

```ts
export async function sendSplitText(phone: string, text: string) {
  const blocks = splitIntoBlocks(text)
  if (blocks.length === 0) return

  for (let i = 0; i < blocks.length; i++) {
    await sendText(phone, blocks[i])

    // Entre um bloco e o próximo, espera aleatória de 2 a 3 segundos.
    if (i < blocks.length - 1) {
      await sleep(getRandomBlockDelay())
    }
  }
}
```

por:

```ts
export async function sendSplitText(phone: string, text: string) {
  const blocks = splitIntoBlocks(text)
  if (blocks.length === 0) return

  // Marca que o bot está enviando para este número, para o webhook não
  // confundir o eco do próprio envio com uma mensagem humana manual.
  const redis = getRedis()
  await redis.set(`bot:sending:${phone}`, '1', 'EX', botSendingTtlSeconds(blocks.length))

  for (let i = 0; i < blocks.length; i++) {
    await sendText(phone, blocks[i])

    // Entre um bloco e o próximo, espera aleatória de 2 a 3 segundos.
    if (i < blocks.length - 1) {
      await sleep(getRandomBlockDelay())
    }
  }
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx tsx scripts/test-split-blocks.ts`
Expected: todas as linhas `OK - ...` impressas, sem erro.

- [ ] **Step 5: Commit**

```bash
git add lib/uazapi/client.ts scripts/test-split-blocks.ts
git commit -m "feat: marca bot:sending no redis antes de enviar blocos, evita autolock"
```

---

### Task 3: Webhook — reordenar parsing e tratar `fromMe` como lock humano (vs eco do bot)

**Files:**
- Modify: `app/api/webhook/whatsapp/route.ts:1-122`

**Interfaces:**
- Consumes: `getRedis()` de `lib/redis/client.ts`

- [ ] **Step 1: Adicionar o import**

No topo de `app/api/webhook/whatsapp/route.ts`, adicionar:

```ts
import { getRedis } from '@/lib/redis/client'
```

- [ ] **Step 2: Reordenar parsing (phone antes do fromMe) e adicionar o branch de lock humano**

Localizar o trecho (da abertura de `POST` até a linha `if (!conversation) return NextResponse.json({ ok: true })`):

```ts
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    console.log('[WEBHOOK] payload recebido:', JSON.stringify(body))

    // Recebe todos os eventos, mas a IA só responde a mensagens novas.
    // Ignora eventos que não sejam de mensagem (connection, presence, history, etc).
    const eventType = body.EventType ?? body.event ?? body.type
    if (eventType && String(eventType).toLowerCase() !== 'messages') {
      console.log('[WEBHOOK] evento ignorado (nao e mensagem):', eventType)
      return NextResponse.json({ ok: true })
    }

    // uazapi v2 aninha a mensagem em body.message; aceita também payload achatado
    const msg = body.message ?? body.data ?? body

    // Ignora mensagens enviadas pelo próprio número (fromMe)
    if (msg.fromMe ?? body.fromMe) return NextResponse.json({ ok: true })

    // wa_chatid é o identificador do chat no formato NUMERO@s.whatsapp.net
    const rawChatId = body.wa_chatid ?? msg.wa_chatid ?? msg.chatid ?? msg.sender ?? msg.from ?? body.from ?? ''
    const phone     = String(rawChatId).replace('@s.whatsapp.net', '').replace('@c.us', '')
    const waChatId  = phone ? `${phone}@s.whatsapp.net` : ''
    const message   = msg.text ?? msg.body ?? msg.content?.text ?? body.text ?? ''

    if (!phone || !message) {
      console.log('[WEBHOOK] ignorado — phone ou message vazio. phone:', phone, 'message:', message)
      return NextResponse.json({ ok: true })
    }

    // Whitelist de números permitidos, no formato NUMERO@s.whatsapp.net
    const ALLOWED_CHATIDS = [
      '5511994800080@s.whatsapp.net',
      '554187490574@s.whatsapp.net',
      '5511989869931@s.whatsapp.net',
    ]
    if (!ALLOWED_CHATIDS.includes(waChatId)) {
      console.log('[WEBHOOK] ignorado — wa_chatid nao permitido:', waChatId)
      return NextResponse.json({ ok: true })
    }

    const supabase = await createServiceClient()

    // Busca ou cria conversa (limit(1) evita erro de múltiplas linhas)
    const { data: convRows } = await supabase
      .from('ai_conversations')
      .select('*')
      .eq('whatsapp_number', phone)
      .order('created_at', { ascending: true })
      .limit(1)

    let conversation = convRows?.[0] ?? null

    if (!conversation) {
      // Novo lead
      const { data: newLead } = await supabase
        .from('leads')
        .insert({ name: phone, phone, source: 'whatsapp', stage_id: 1 })
        .select()
        .single()

      if (!newLead) return NextResponse.json({ ok: true })

      const { data: newConv } = await supabase
        .from('ai_conversations')
        .insert({
          lead_id: newLead.id,
          whatsapp_number: phone,
          conversation_history: [],
          qualification_data: {},
          current_step: 'greeting',
        })
        .select()
        .single()

      conversation = newConv
    }

    if (!conversation) return NextResponse.json({ ok: true })
```

Substituir por:

```ts
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    console.log('[WEBHOOK] payload recebido:', JSON.stringify(body))

    // Recebe todos os eventos, mas a IA só responde a mensagens novas.
    // Ignora eventos que não sejam de mensagem (connection, presence, history, etc).
    const eventType = body.EventType ?? body.event ?? body.type
    if (eventType && String(eventType).toLowerCase() !== 'messages') {
      console.log('[WEBHOOK] evento ignorado (nao e mensagem):', eventType)
      return NextResponse.json({ ok: true })
    }

    // uazapi v2 aninha a mensagem em body.message; aceita também payload achatado
    const msg = body.message ?? body.data ?? body

    // wa_chatid é o identificador do chat no formato NUMERO@s.whatsapp.net
    const rawChatId = body.wa_chatid ?? msg.wa_chatid ?? msg.chatid ?? msg.sender ?? msg.from ?? body.from ?? ''
    const phone     = String(rawChatId).replace('@s.whatsapp.net', '').replace('@c.us', '')
    const waChatId  = phone ? `${phone}@s.whatsapp.net` : ''
    const message   = msg.text ?? msg.body ?? msg.content?.text ?? body.text ?? ''
    const isFromMe  = Boolean(msg.fromMe ?? body.fromMe)

    if (!phone) {
      console.log('[WEBHOOK] ignorado — phone vazio')
      return NextResponse.json({ ok: true })
    }

    // Whitelist de números permitidos, no formato NUMERO@s.whatsapp.net
    const ALLOWED_CHATIDS = [
      '5511994800080@s.whatsapp.net',
      '554187490574@s.whatsapp.net',
      '5511989869931@s.whatsapp.net',
    ]
    if (!ALLOWED_CHATIDS.includes(waChatId)) {
      console.log('[WEBHOOK] ignorado — wa_chatid nao permitido:', waChatId)
      return NextResponse.json({ ok: true })
    }

    const supabase = await createServiceClient()

    // Busca ou cria conversa (limit(1) evita erro de múltiplas linhas)
    const { data: convRows } = await supabase
      .from('ai_conversations')
      .select('*')
      .eq('whatsapp_number', phone)
      .order('created_at', { ascending: true })
      .limit(1)

    let conversation = convRows?.[0] ?? null

    if (!conversation) {
      // Novo lead
      const { data: newLead } = await supabase
        .from('leads')
        .insert({ name: phone, phone, source: 'whatsapp', stage_id: 1 })
        .select()
        .single()

      if (!newLead) return NextResponse.json({ ok: true })

      const { data: newConv } = await supabase
        .from('ai_conversations')
        .insert({
          lead_id: newLead.id,
          whatsapp_number: phone,
          conversation_history: [],
          qualification_data: {},
          current_step: 'greeting',
        })
        .select()
        .single()

      conversation = newConv
    }

    if (!conversation) return NextResponse.json({ ok: true })

    // ── fromMe: pode ser eco do próprio bot ou um humano respondendo manual ──
    if (isFromMe) {
      const redis = getRedis()
      const isBotEcho = await redis.exists(`bot:sending:${phone}`)

      if (!isBotEcho) {
        // Humano de verdade assumiu a conversa: trava a IA por 15 minutos,
        // renovado a cada nova mensagem humana (não por mensagens do lead).
        await redis.set(`human_lock:${phone}`, '1', 'EX', 900)

        if (message) {
          const ts = new Date().toISOString()
          await supabase.from('ai_conversations').update({
            conversation_history: [
              ...(conversation.conversation_history ?? []),
              { role: 'assistant', content: message, timestamp: ts },
            ],
            updated_at: ts,
          }).eq('id', conversation.id)
        }
      }

      return NextResponse.json({ ok: true })
    }

    if (!message) {
      console.log('[WEBHOOK] ignorado — message vazio. phone:', phone)
      return NextResponse.json({ ok: true })
    }
```

- [ ] **Step 3: Verificar que o arquivo ainda compila**

Run: `npx tsc --noEmit`
Expected: sem erros novos relacionados a `route.ts` (o restante do arquivo, tasks seguintes, ainda referencia `arrivalTs`/`historyWithUser` que serão tratados no Task 4 — se o compilador reclamar de variáveis duplicadas ou não usadas nessa área, é esperado até o Task 4 ser aplicado).

- [ ] **Step 4: Commit**

```bash
git add app/api/webhook/whatsapp/route.ts
git commit -m "feat: distingue eco do bot de mensagem humana manual via redis, trava 15min"
```

---

### Task 4: Webhook — lock humano bloqueia resposta da IA + agrupamento via Redis (30s)

**Files:**
- Modify: `app/api/webhook/whatsapp/route.ts` (bloco entre o fim do branch `fromMe` e o processamento da mensagem)

**Interfaces:**
- Consumes: `getRedis()` (já importado no Task 3)

- [ ] **Step 1: Substituir o bloco desativado de `human_takeover` + debounce por Supabase pelo lock humano + agrupamento via Redis**

Localizar (imediatamente após o `if (!message) { ... }` do Task 3, seguindo o arquivo original):

```ts
    // NOTA: durante esta fase o bot responde a TODAS as mensagens.
    // A trava de human_takeover foi desativada de propósito. Para reativar o
    // handoff manual pelo CRM no futuro, basta descomentar a linha abaixo:
    // if (conversation.human_takeover) return NextResponse.json({ ok: true })
    if (conversation.human_takeover) {
      // Lead voltou a falar: reativa o bot para garantir continuidade
      await supabase.from('ai_conversations')
        .update({ human_takeover: false })
        .eq('id', conversation.id)
      conversation.human_takeover = false
    }

    // ── Registra a mensagem do lead no histórico imediatamente ──
    const arrivalTs = new Date().toISOString()
    const historyWithUser = [
      ...(conversation.conversation_history ?? []),
      { role: 'user', content: message, timestamp: arrivalTs },
    ]
    await supabase.from('ai_conversations').update({
      conversation_history: historyWithUser,
      updated_at: arrivalTs,
    }).eq('id', conversation.id)

    await supabase.from('interactions').insert({
      lead_id: conversation.lead_id,
      channel: 'whatsapp',
      direction: 'inbound',
      content: message,
    })

    // ── Debounce: espera 5s. Se chegar mensagem mais nova, esta invocação sai
    //    e deixa a invocação da última mensagem responder a tudo de uma vez. ──
    await new Promise((r) => setTimeout(r, 5000))

    const { data: freshRows } = await supabase
      .from('ai_conversations')
      .select('*')
      .eq('id', conversation.id)
      .limit(1)
    const fresh = freshRows?.[0] ?? conversation
    const freshHistory: Array<{ role: string; content: string; timestamp?: string }> =
      fresh.conversation_history ?? []

    const lastUser = [...freshHistory].reverse().find((m) => m.role === 'user')
    if (lastUser && lastUser.timestamp !== arrivalTs) {
      console.log('[WEBHOOK] mensagem mais recente chegou — esta invocação aguarda a próxima responder')
      return NextResponse.json({ ok: true })
    }
```

Substituir por:

```ts
    // ── Registra a mensagem do lead no histórico imediatamente ──
    const arrivalTs = new Date().toISOString()
    const historyWithUser = [
      ...(conversation.conversation_history ?? []),
      { role: 'user', content: message, timestamp: arrivalTs },
    ]
    await supabase.from('ai_conversations').update({
      conversation_history: historyWithUser,
      updated_at: arrivalTs,
    }).eq('id', conversation.id)

    await supabase.from('interactions').insert({
      lead_id: conversation.lead_id,
      channel: 'whatsapp',
      direction: 'inbound',
      content: message,
    })

    // ── Se um humano assumiu a conversa manualmente, a IA não responde ──
    // enquanto o lock estiver ativo (15 minutos, renovado a cada mensagem humana).
    const redis = getRedis()
    const isHumanLocked = await redis.exists(`human_lock:${phone}`)
    if (isHumanLocked) {
      console.log('[WEBHOOK] conversa travada por atendimento humano manual — IA nao responde:', phone)
      return NextResponse.json({ ok: true })
    }

    // ── Agrupamento: espera 30s. Se chegar mensagem mais nova (marcador no
    //    Redis muda), esta invocação sai e deixa a invocação da última
    //    mensagem responder a tudo de uma vez. ──
    await redis.set(`latest_msg:${phone}`, arrivalTs, 'EX', 60)
    await new Promise((r) => setTimeout(r, 30000))

    const latestMarker = await redis.get(`latest_msg:${phone}`)
    if (latestMarker !== arrivalTs) {
      console.log('[WEBHOOK] mensagem mais recente chegou — esta invocação aguarda a próxima responder')
      return NextResponse.json({ ok: true })
    }

    const { data: freshRows } = await supabase
      .from('ai_conversations')
      .select('*')
      .eq('id', conversation.id)
      .limit(1)
    const fresh = freshRows?.[0] ?? conversation
    const freshHistory: Array<{ role: string; content: string; timestamp?: string }> =
      fresh.conversation_history ?? []
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add app/api/webhook/whatsapp/route.ts
git commit -m "feat: lock humano de 15min via redis e agrupamento de mensagens em 30s"
```

---

### Task 5: Verificação manual ponta a ponta

**Files:** nenhum (apenas verificação)

- [ ] **Step 1: Subir o servidor local com `REDIS_URL` e as demais envs configuradas**

Run: `npm run dev`

- [ ] **Step 2: Simular 3 mensagens seguidas do lead em menos de 30s (agrupamento)**

Enviar 3 `curl` seguidos (menos de 30s entre eles) simulando o payload da uazapi para o mesmo `wa_chatid` de teste (um dos números da whitelist), com textos diferentes. Confirmar nos logs que apenas a última invocação processa e chama a IA, e que a resposta cobre o conteúdo das 3 mensagens combinadas.

- [ ] **Step 3: Simular uma mensagem humana manual (fromMe) e confirmar o lock**

Enviar um `curl` com `fromMe: true` para o mesmo número, sem passar por `sendSplitText` antes (ou seja, sem a flag `bot:sending` ativa). Confirmar via `redis-cli GET human_lock:<phone>` que a chave existe com TTL próximo de 900s, e que uma mensagem do lead logo em seguida não gera resposta da IA (log `conversa travada por atendimento humano manual`).

- [ ] **Step 4: Confirmar que o envio do próprio bot não cria o lock**

Deixar o lock expirar (ou usar outro número de teste) e simular uma conversa normal ponta a ponta (mensagem do lead → resposta da IA via `sendSplitText`). Confirmar via `redis-cli EXISTS human_lock:<phone>` que nenhum lock foi criado pelo próprio envio do bot.

- [ ] **Step 5: Registrar o resultado**

Se todos os passos acima se comportarem como esperado, a implementação desta frente está validada ponta a ponta. Qualquer divergência deve ser tratada como bug antes de considerar a frente concluída.

---

## Self-Review Notes

- Cobertura da spec: flag bot-sending (Task 2), distinção eco/humano + lock 15min (Task 3), agrupamento 30s via Redis (Task 4) — todos os pontos da spec `2026-07-03-redis-lock-e-agrupamento-design.md` cobertos.
- Sem placeholders — todo código está completo nos steps acima.
- Consistência de tipos: `getRedis()` usado de forma idêntica em `lib/uazapi/client.ts` e `app/api/webhook/whatsapp/route.ts`; chaves Redis usam sempre `phone` (nunca `waChatId`) nas 3 frentes (`bot:sending`, `human_lock`, `latest_msg`).
- Dependência de infraestrutura: Redis na VPS Easypanel precisa estar acessível pela aplicação (rede liberada) antes do Task 1 Step 5 e do Task 5 completo poderem ser executados de ponta a ponta.
