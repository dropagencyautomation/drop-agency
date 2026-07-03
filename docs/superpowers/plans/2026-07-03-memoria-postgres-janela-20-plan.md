# Memória em Postgres (janela de 20 mensagens) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A memória da IA passa a vir da tabela `interactions` (já fonte de verdade do CRM), janela das últimas 20 mensagens por lead, em vez do JSONB `ai_conversations.conversation_history`. Corrige também a lacuna onde respostas humanas manuais (fromMe) não apareciam no CRM.

**Architecture:** Uma função auxiliar `getRecentHistory` no webhook busca as últimas 20 linhas de `interactions` do lead e mapeia para o formato `{role, content, timestamp}` já esperado por `processMessage`/`generateLeadSummary`/`generateHandoffGuidance` (nenhuma dessas funções muda de assinatura). O branch `fromMe` passa a inserir em `interactions` em vez de `conversation_history`.

**Tech Stack:** TypeScript, Next.js, Supabase (sem mudança de schema).

## Global Constraints

- Spec de referência: `docs/superpowers/specs/2026-07-03-memoria-postgres-janela-20-design.md`
- Não remover/alterar a coluna `ai_conversations.conversation_history` no banco (só para de ser lida/escrita pelo webhook).
- `ai_conversations` continua guardando `qualification_data` e `current_step` — isso não muda.
- Janela: 20 mensagens mais recentes por `lead_id`, `channel = 'whatsapp'`, ordenadas por `created_at`.

---

### Task 1: Função auxiliar `getRecentHistory` + tipo `HistoryRow`

**Files:**
- Modify: `app/api/webhook/whatsapp/route.ts`

**Interfaces:**
- Produces: `getRecentHistory(supabase, leadId: string, limit?: number): Promise<HistoryRow[]>`, onde `HistoryRow = { role: 'user' | 'assistant'; content: string; timestamp: string }`.

- [ ] **Step 1: Adicionar o tipo e a função, logo após `LEAD_FIELD_KEYS`**

```ts
type HistoryRow = { role: 'user' | 'assistant'; content: string; timestamp: string }

async function getRecentHistory(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  leadId: string,
  limit = 20
): Promise<HistoryRow[]> {
  const { data } = await supabase
    .from('interactions')
    .select('direction, content, created_at')
    .eq('lead_id', leadId)
    .eq('channel', 'whatsapp')
    .order('created_at', { ascending: false })
    .limit(limit)

  return (data ?? [])
    .slice()
    .reverse()
    .map((row) => ({
      role: row.direction === 'inbound' ? 'user' as const : 'assistant' as const,
      content: row.content as string,
      timestamp: row.created_at as string,
    }))
}
```

- [ ] **Step 2: Rodar o typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros novos (a função ainda não é usada, então nenhuma quebra é esperada aqui).

- [ ] **Step 3: Commit**

```bash
git add app/api/webhook/whatsapp/route.ts
git commit -m "feat: adiciona getRecentHistory, janela de 20 mensagens via interactions"
```

---

### Task 2: Corrigir o branch `fromMe` para gravar em `interactions`

**Files:**
- Modify: `app/api/webhook/whatsapp/route.ts`

- [ ] **Step 1: Substituir a gravação em `conversation_history` por um insert em `interactions`**

Localizar:

```ts
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
```

Substituir por:

```ts
      if (!isBotEcho) {
        // Humano de verdade assumiu a conversa: trava a IA por 15 minutos,
        // renovado a cada nova mensagem humana (não por mensagens do lead).
        await redis.set(`human_lock:${phone}`, '1', 'EX', 900)

        if (message) {
          // Grava em interactions (fonte de verdade do chat no CRM e da
          // memória da IA), não mais em conversation_history.
          await supabase.from('interactions').insert({
            lead_id: conversation.lead_id,
            channel: 'whatsapp',
            direction: 'outbound',
            content: message,
            ai_generated: false,
          })
        }
      }
```

- [ ] **Step 2: Rodar o typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add app/api/webhook/whatsapp/route.ts
git commit -m "fix: mensagem humana manual (fromMe) agora aparece no chat do CRM"
```

---

### Task 3: Trocar o fluxo principal para usar a janela de `interactions`

**Files:**
- Modify: `app/api/webhook/whatsapp/route.ts`

- [ ] **Step 1: Remover a gravação de `conversation_history` ao registrar a mensagem do lead**

Localizar:

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
```

Substituir por:

```ts
    // ── Registra a mensagem do lead imediatamente (fonte única: interactions) ──
    const arrivalTs = new Date().toISOString()
    await supabase.from('interactions').insert({
      lead_id: conversation.lead_id,
      channel: 'whatsapp',
      direction: 'inbound',
      content: message,
    })
```

- [ ] **Step 2: Trocar a leitura pós-debounce de `ai_conversations`/JSONB para a janela de `interactions`**

Localizar:

```ts
    const { data: freshRows } = await supabase
      .from('ai_conversations')
      .select('*')
      .eq('id', conversation.id)
      .limit(1)
    const fresh = freshRows?.[0] ?? conversation
    const freshHistory: Array<{ role: string; content: string; timestamp?: string }> =
      fresh.conversation_history ?? []

    // ── Junta todas as mensagens do lead ainda não respondidas ──
    let lastAssistantIdx = -1
    for (let i = freshHistory.length - 1; i >= 0; i--) {
      if (freshHistory[i].role === 'assistant') { lastAssistantIdx = i; break }
    }
    const priorHistory = freshHistory.slice(0, lastAssistantIdx + 1)
    const combinedMessage = freshHistory
      .slice(lastAssistantIdx + 1)
      .filter((m) => m.role === 'user')
      .map((m) => m.content)
      .join('\n')

    // Processa com IA (histórico anterior + bloco de mensagens novas combinadas)
    const { reply, updatedQualification, shouldHandoff } = await processMessage(
      { ...fresh, conversation_history: priorHistory } as AiConversation,
      combinedMessage
    )

    // Atualiza histórico com a resposta
    const finalHistory = [
      ...freshHistory,
      { role: 'assistant', content: reply, timestamp: new Date().toISOString() },
    ]

    await supabase.from('ai_conversations').update({
      conversation_history: finalHistory,
      qualification_data: updatedQualification,
      updated_at: new Date().toISOString(),
    }).eq('id', conversation.id)

    // Registra resposta da IA
    await supabase.from('interactions').insert({
      lead_id: conversation.lead_id,
      channel: 'whatsapp',
      direction: 'outbound',
      content: reply,
      ai_generated: true,
    })
```

Substituir por:

```ts
    const freshHistory = await getRecentHistory(supabase, conversation.lead_id)

    // ── Junta todas as mensagens do lead ainda não respondidas ──
    let lastAssistantIdx = -1
    for (let i = freshHistory.length - 1; i >= 0; i--) {
      if (freshHistory[i].role === 'assistant') { lastAssistantIdx = i; break }
    }
    const priorHistory = freshHistory.slice(0, lastAssistantIdx + 1)
    const combinedMessage = freshHistory
      .slice(lastAssistantIdx + 1)
      .filter((m) => m.role === 'user')
      .map((m) => m.content)
      .join('\n')

    // Processa com IA (histórico anterior + bloco de mensagens novas combinadas)
    const { reply, updatedQualification, shouldHandoff } = await processMessage(
      { ...conversation, conversation_history: priorHistory } as AiConversation,
      combinedMessage
    )

    // Registra resposta da IA
    await supabase.from('interactions').insert({
      lead_id: conversation.lead_id,
      channel: 'whatsapp',
      direction: 'outbound',
      content: reply,
      ai_generated: true,
    })

    await supabase.from('ai_conversations').update({
      qualification_data: updatedQualification,
      updated_at: new Date().toISOString(),
    }).eq('id', conversation.id)

    // Histórico completo (janela + resposta desta rodada), usado pelo resumo/orientações
    const finalHistory: HistoryRow[] = [
      ...freshHistory,
      { role: 'assistant', content: reply, timestamp: new Date().toISOString() },
    ]
```

Atenção: a ordem mudou — o insert em `interactions` (resposta da IA) agora acontece **antes** do update de `ai_conversations` (que agora só grava `qualification_data`), e ambos antes do restante do fluxo (resumo, envio, handoff), que permanece igual.

- [ ] **Step 3: Rodar o typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros. Se aparecer erro de tipo em `freshHistory`/`finalHistory` (ex: `role: string` vs `'user'|'assistant'`), confirmar que `getRecentHistory` está tipada como no Task 1 (retorna `HistoryRow[]`, já com literais corretos).

- [ ] **Step 4: Rodar o build**

Run: `npm run build`
Expected: build concluído sem erros.

- [ ] **Step 5: Commit**

```bash
git add app/api/webhook/whatsapp/route.ts
git commit -m "feat: memoria da IA passa a vir de interactions, janela de 20 mensagens"
```

---

### Task 4: Verificação manual

**Files:** nenhum (apenas verificação)

- [ ] **Step 1: Rodar `npx tsx scripts/replay-test1.ts` e conferir que o comportamento de qualificação/handoff continua coerente**

- [ ] **Step 2: Testar manualmente que uma mensagem enviada pelo WhatsApp conectado (fromMe humano, sem a flag bot:sending) aparece no chat do CRM logo em seguida** (antes desta frente, não aparecia)

- [ ] **Step 3: Testar uma conversa com mais de 20 mensagens trocadas e confirmar que a IA continua respondendo coerentemente** (usando só a janela mais recente, sem erro)

---

## Self-Review Notes

- Cobertura da spec: janela de 20 via `interactions` (Task 1, 3), correção do bug de visibilidade no CRM para mensagens `fromMe` (Task 2), remoção da dependência de `conversation_history` no webhook (Task 3).
- Sem placeholders — todo código está completo nos steps acima.
- Consistência de tipos: `HistoryRow` é o mesmo formato `{role, content, timestamp}` que `processMessage`/`generateLeadSummary`/`generateHandoffGuidance` já esperavam de `conversation_history` — nenhuma dessas assinaturas muda.
- Nenhuma migração de banco necessária — reaproveita `interactions`, que já existe.
