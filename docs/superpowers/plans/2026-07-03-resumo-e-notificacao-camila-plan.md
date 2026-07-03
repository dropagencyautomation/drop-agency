# Resumo Automático + Notificação Camila — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gerar um resumo de uma linha do lead a cada 2 mensagens (salvo no Supabase), e ao acionar handoff, enviar uma segunda mensagem fixa ao lead e notificar a Camila com resumo + orientações no formato pedido.

**Architecture:** Duas novas funções LLM em `lib/openai/agent.ts` (`generateLeadSummary`, `generateHandoffGuidance`), uma nova função de envio em `lib/uazapi/client.ts` (`notifyQualifiedLead`, substitui `notifyHandoff`), uma migração nova no Supabase (`leads.summary`), e ajustes no webhook para disparar tudo isso. Corrige também a localização da flag `bot:sending` (movida de `sendSplitText` para `sendText`).

**Tech Stack:** TypeScript, Next.js, OpenAI SDK, Supabase, ioredis (já configurados).

## Global Constraints

- Spec de referência: `docs/superpowers/specs/2026-07-03-resumo-e-notificacao-camila-design.md`
- `ADMIN_PHONE` deve ser configurado com o número da Camila (`5511989869931`, sem `@s.whatsapp.net`) em `.env.local`/produção.
- Texto de notificação da Camila deve seguir exatamente o formato do spec (emoji, quebras de linha, separador de traços).
- Nenhuma função nova deve quebrar o fluxo principal em caso de erro (mesma robustez de `extractQualificationData`: captura exceção, retorna vazio/string vazia).

---

### Task 1: Corrigir a flag `bot:sending` — mover de `sendSplitText` para `sendText`

**Files:**
- Modify: `lib/uazapi/client.ts`
- Modify: `scripts/test-split-blocks.ts` (remover asserções de `botSendingTtlSeconds`)

**Interfaces:**
- Remove: `botSendingTtlSeconds` (não é mais exportada/usada).
- `sendText(phone: string, text: string)` continua com a mesma assinatura, mas agora marca `bot:sending:{phone}` internamente.

- [ ] **Step 1: Atualizar `sendText` e remover a marcação de `sendSplitText`**

Em `lib/uazapi/client.ts`, substituir:

```ts
export async function sendText(phone: string, text: string) {
  return request('/send/text', {
    number: phone,
    text,
    delay: getRandomTypingDelay(),
  })
}
```

por:

```ts
export async function sendText(phone: string, text: string) {
  // Marca que o bot está enviando para este número, para o webhook não
  // confundir o eco do próprio envio com uma mensagem humana manual.
  // TTL curto, renovado a cada chamada — cobre qualquer envio (blocos
  // múltiplos, mensagens fixas, notificações), sem precisar prever a
  // duração total antecipadamente.
  await getRedis().set(`bot:sending:${phone}`, '1', 'EX', 15)

  return request('/send/text', {
    number: phone,
    text,
    delay: getRandomTypingDelay(),
  })
}
```

E substituir `sendSplitText` (hoje):

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

por (remove a marcação duplicada e a função `botSendingTtlSeconds`):

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

Remover também a função `botSendingTtlSeconds` inteira (bloco de comentário + função) que ficava logo acima de `sendSplitText`.

- [ ] **Step 2: Atualizar o teste, removendo as asserções da função removida**

Em `scripts/test-split-blocks.ts`, remover:

```ts
import { splitIntoBlocks, stripTrailingPeriod, botSendingTtlSeconds } from '../lib/uazapi/client'
```

e trocar por:

```ts
import { splitIntoBlocks, stripTrailingPeriod } from '../lib/uazapi/client'
```

Remover também as linhas:

```ts
assert.equal(botSendingTtlSeconds(1), 15)
assert.equal(botSendingTtlSeconds(3), 25)
```

E ajustar a mensagem final de sucesso para não citar mais `botSendingTtlSeconds`:

```ts
console.log('OK - todos os testes de splitIntoBlocks/stripTrailingPeriod passaram')
```

- [ ] **Step 3: Rodar o teste e o typecheck**

Run: `npx tsx scripts/test-split-blocks.ts`
Expected: `OK - todos os testes de splitIntoBlocks/stripTrailingPeriod passaram`

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add lib/uazapi/client.ts scripts/test-split-blocks.ts
git commit -m "fix: move flag bot:sending para sendText, cobre qualquer envio ao whatsapp"
```

---

### Task 2: Migração Supabase — coluna `leads.summary`

**Files:**
- Create: `supabase/migrations/002_lead_summary.sql`

- [ ] **Step 1: Criar a migração**

```sql
-- =============================================
-- Resumo automático do lead (atualizado a cada 2 mensagens pela IA)
-- =============================================

ALTER TABLE leads ADD COLUMN summary TEXT;
```

- [ ] **Step 2: Rodar a migração no Supabase (SQL editor do painel, já que o projeto não usa CLI de migração automatizada)**

Copiar o conteúdo de `supabase/migrations/002_lead_summary.sql` e executar no SQL editor do Supabase. Confirmar que a coluna `summary` aparece na tabela `leads` (nula para os registros existentes, o que é esperado).

- [ ] **Step 3: Adicionar o campo ao tipo TypeScript**

Em `types/database.ts`, localizar a interface `Lead` (ou equivalente) e adicionar o campo `summary`. Rode antes: `grep -n "interface Lead " types/database.ts` para confirmar o nome exato da interface e a posição de outros campos de texto livre (ex: `main_pains`), e adicione `summary?: string` próximo a eles.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/002_lead_summary.sql types/database.ts
git commit -m "feat: adiciona coluna leads.summary para resumo automatico do lead"
```

---

### Task 3: Geração do resumo e das orientações (LLM)

**Files:**
- Modify: `lib/openai/agent.ts`

**Interfaces:**
- Produces: `generateLeadSummary(history: AiConversation['conversation_history'], qualification: QualificationData): Promise<string>` — retorna uma linha, ou `''` em caso de erro.
- Produces: `generateHandoffGuidance(history: AiConversation['conversation_history'], qualification: QualificationData): Promise<string>` — retorna um parágrafo, ou `''` em caso de erro.

- [ ] **Step 1: Adicionar os dois novos system prompts**

Em `lib/openai/agent.ts`, logo após o fechamento do `EXTRACTION_SYSTEM_PROMPT` (depois da linha `Responda em JSON puro, sem comentários.\``), adicionar:

```ts
const SUMMARY_SYSTEM_PROMPT = `Você resume, em UMA ÚNICA FRASE curta e direta, quem é o lead de uma conversa comercial de WhatsApp com a Drop Agency.

Baseie-se na conversa e nos dados já qualificados. Foque em: tipo de negócio/nicho, principal dificuldade ou objetivo, e contexto relevante para quem for continuar o atendimento.

Responda em texto puro, uma frase só, sem aspas, sem prefixo como "Resumo:". Se não houver informação suficiente ainda, responda com uma frase curta descrevendo o que já se sabe (ex: "Lead ainda não informou o segmento do negócio").`

const GUIDANCE_SYSTEM_PROMPT = `Você prepara um briefing curto para a Camila, consultora humana da Drop Agency, que vai continuar o atendimento de um lead que a IA (Carol) acabou de qualificar via WhatsApp.

Releia a conversa inteira e escreva um parágrafo (não uma lista) cobrindo, quando a informação existir:
- Personalidade e forma de se comunicar do lead (direto, informal, técnico, receoso, etc.)
- Nome do lead, se identificado
- Nicho ou segmento do negócio
- Principais dores ou dificuldades relatadas
- Nível de interesse demonstrado
- Dados pessoais ou comerciais relevantes entendidos na conversa
- Recomendação de abordagem: como a Camila deve continuar a conversa

Não invente informação que não apareceu na conversa. Se faltar algo, simplesmente não mencione. Responda em texto corrido, em português, sem títulos ou marcadores.`
```

- [ ] **Step 2: Implementar `generateLeadSummary` e `generateHandoffGuidance`**

Logo após a função `mergeQualificationData` (antes de `const REVENUE_SCORE`), adicionar:

```ts
function buildTranscript(
  history: AiConversation['conversation_history'],
  qualification: QualificationData
): string {
  const conversationText = history
    .map((m) => `${m.role === 'user' ? 'Lead' : 'Carol'}: ${m.content}`)
    .join('\n')
  const qualificationText = Object.entries(qualification)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n')
  return `Conversa:\n${conversationText}\n\nDados já qualificados:\n${qualificationText || '(nenhum ainda)'}`
}

export async function generateLeadSummary(
  history: AiConversation['conversation_history'],
  qualification: QualificationData
): Promise<string> {
  const openai = getOpenAI()
  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: SUMMARY_SYSTEM_PROMPT },
        { role: 'user', content: buildTranscript(history, qualification) },
      ],
      temperature: 0.3,
      max_tokens: 100,
    })
    return completion.choices[0].message.content?.trim() ?? ''
  } catch {
    return ''
  }
}

export async function generateHandoffGuidance(
  history: AiConversation['conversation_history'],
  qualification: QualificationData
): Promise<string> {
  const openai = getOpenAI()
  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: GUIDANCE_SYSTEM_PROMPT },
        { role: 'user', content: buildTranscript(history, qualification) },
      ],
      temperature: 0.3,
      max_tokens: 400,
    })
    return completion.choices[0].message.content?.trim() ?? ''
  } catch {
    return ''
  }
}
```

- [ ] **Step 3: Verificar visualmente**

Rodar: `npx tsx scripts/replay-test1.ts` (ou um script ad-hoc chamando `generateLeadSummary`/`generateHandoffGuidance` diretamente com uma transcrição de teste) e confirmar que ambas retornam texto coerente em português, sem quebrar em histórico curto.

- [ ] **Step 4: Rodar o typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add lib/openai/agent.ts
git commit -m "feat: gera resumo de uma linha e orientacoes para a camila via llm"
```

---

### Task 4: Notificação da Camila — substituir `notifyHandoff`

**Files:**
- Modify: `lib/uazapi/client.ts`

**Interfaces:**
- Remove: `notifyHandoff` (substituída).
- Produces: `notifyQualifiedLead(leadPhone: string, summary: string, guidance: string): Promise<void>`

- [ ] **Step 1: Substituir `notifyHandoff`**

Em `lib/uazapi/client.ts`, substituir:

```ts
export async function notifyHandoff(leadPhone: string, leadName: string, summary: string) {
  const adminPhone = process.env.ADMIN_PHONE
  if (!adminPhone) return
  const text =
    `🚨 *Novo lead para atendimento humano*\n\n` +
    `👤 *Lead:* ${leadName}\n` +
    `📱 *WhatsApp:* +${leadPhone}\n\n` +
    `📋 *Resumo da conversa:*\n${summary}\n\n` +
    `👉 Acesse o CRM para continuar o atendimento.`
  await sendText(adminPhone, text)
}
```

por:

```ts
export async function notifyQualifiedLead(leadPhone: string, summary: string, guidance: string) {
  const adminPhone = process.env.ADMIN_PHONE
  if (!adminPhone) return
  const text =
    `✅ NOVO LEAD QUALIFICADO\n\n` +
    `o lead: ${leadPhone} foi qualificado pela agente de IA Carol\n\n` +
    `resumo: ${summary}\n\n` +
    `orientações: ${guidance}\n\n` +
    `--------------------------------------------------`
  await sendText(adminPhone, text)
}
```

- [ ] **Step 2: Rodar o typecheck (vai acusar uso de `notifyHandoff`/`buildHandoffSummary` em `route.ts` até o Task 5 ser aplicado)**

Run: `npx tsc --noEmit`
Expected: erro em `app/api/webhook/whatsapp/route.ts` referenciando `notifyHandoff` não encontrado — esperado, resolvido no Task 5.

- [ ] **Step 3: Commit**

```bash
git add lib/uazapi/client.ts
git commit -m "feat: substitui notifyHandoff por notifyQualifiedLead no formato pedido"
```

---

### Task 5: Integrar no webhook — resumo a cada 2 mensagens + segunda mensagem fixa + notificação

**Files:**
- Modify: `app/api/webhook/whatsapp/route.ts`

**Interfaces:**
- Consumes: `generateLeadSummary`, `generateHandoffGuidance` (Task 3), `notifyQualifiedLead` (Task 4)

- [ ] **Step 1: Atualizar os imports**

Substituir:

```ts
import { processMessage, computeLeadScore } from '@/lib/openai/agent'
import { sendSplitText, notifyHandoff } from '@/lib/uazapi/client'
```

por:

```ts
import { processMessage, computeLeadScore, generateLeadSummary, generateHandoffGuidance } from '@/lib/openai/agent'
import { sendSplitText, sendText, notifyQualifiedLead } from '@/lib/uazapi/client'
```

- [ ] **Step 2: Remover `buildHandoffSummary` (não é mais usada)**

Remover a função inteira `buildHandoffSummary` (linhas próximas ao topo do arquivo, antes de `export async function POST`).

- [ ] **Step 3: Adicionar o gatilho do resumo (a cada 2 mensagens do lead) e trocar a lógica de handoff**

Localizar o trecho final do handler (a partir de `// Persiste os dados qualificados direto no lead`):

```ts
    // Persiste os dados qualificados direto no lead, conforme a conversa avança
    const { score, profile } = computeLeadScore(updatedQualification)
    const leadUpdate: Record<string, unknown> = {
      last_interaction_at: new Date().toISOString(),
      score,
      profile,
    }
    if (updatedQualification.name) leadUpdate.name = updatedQualification.name
    for (const key of LEAD_FIELD_KEYS) {
      if (updatedQualification[key] !== undefined) leadUpdate[key] = updatedQualification[key]
    }

    await supabase.from('leads').update(leadUpdate).eq('id', conversation.lead_id)

    // Envia resposta em blocos separados
    await sendSplitText(phone, reply)

    // Se handoff: avança lead no kanban + notifica Camila com resumo completo
    if (shouldHandoff) {
      const { data: lead } = await supabase
        .from('leads')
        .select('name, phone')
        .eq('id', conversation.lead_id)
        .single()

      await supabase.from('leads').update({ stage_id: 2 }).eq('id', conversation.lead_id)

      const leadName = updatedQualification.name ?? lead?.name ?? phone
      const nextStep =
        updatedQualification.service_type === 'recorrente'
          ? 'sessão estratégica com a Camila'
          : 'continuar atendimento humano'
      const summary = buildHandoffSummary(leadName, updatedQualification, score, nextStep)

      await notifyHandoff(phone, leadName, summary)
    }

    return NextResponse.json({ ok: true })
```

Substituir por:

```ts
    // Persiste os dados qualificados direto no lead, conforme a conversa avança
    const { score, profile } = computeLeadScore(updatedQualification)
    const leadUpdate: Record<string, unknown> = {
      last_interaction_at: new Date().toISOString(),
      score,
      profile,
    }
    if (updatedQualification.name) leadUpdate.name = updatedQualification.name
    for (const key of LEAD_FIELD_KEYS) {
      if (updatedQualification[key] !== undefined) leadUpdate[key] = updatedQualification[key]
    }

    // A cada 2 mensagens do lead, recalcula o resumo de uma linha
    const userMessageCount = finalHistory.filter((m) => m.role === 'user').length
    let latestSummary: string | undefined
    if (userMessageCount % 2 === 0) {
      const generated = await generateLeadSummary(finalHistory, updatedQualification)
      if (generated) {
        latestSummary = generated
        leadUpdate.summary = generated
      }
    }

    await supabase.from('leads').update(leadUpdate).eq('id', conversation.lead_id)

    // Envia resposta em blocos separados
    await sendSplitText(phone, reply)

    // Se handoff: mensagem fixa de encerramento + notifica a Camila
    if (shouldHandoff) {
      await sendText(phone, 'Obrigado pelo contato, em breve vamos falar com você')

      await supabase.from('leads').update({ stage_id: 2 }).eq('id', conversation.lead_id)

      const summary =
        latestSummary ?? (await generateLeadSummary(finalHistory, updatedQualification)) ?? ''
      const guidance = await generateHandoffGuidance(finalHistory, updatedQualification)

      await notifyQualifiedLead(phone, summary, guidance)
    }

    return NextResponse.json({ ok: true })
```

- [ ] **Step 4: Rodar o typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 5: Rodar o build**

Run: `npm run build`
Expected: build concluído sem erros.

- [ ] **Step 6: Commit**

```bash
git add app/api/webhook/whatsapp/route.ts
git commit -m "feat: resumo automatico a cada 2 mensagens, mensagem fixa e notificacao de lead qualificado"
```

---

## Self-Review Notes

- Cobertura da spec: flag bot:sending corrigida (Task 1), coluna de resumo (Task 2), geração LLM de resumo/orientações (Task 3), notificação no formato pedido (Task 4), integração completa no webhook incluindo a segunda mensagem fixa (Task 5).
- Sem placeholders — todo código está completo nos steps acima.
- Consistência de tipos: `generateLeadSummary`/`generateHandoffGuidance` usam o mesmo tipo `AiConversation['conversation_history']` e `QualificationData` já usados em `extractQualificationData`/`mergeQualificationData`.
- Risco conhecido (documentado na spec): `shouldHandoff` pode continuar disparando em mensagens futuras se `current_step` permanecer `'routing'` — fora de escopo corrigir agora.
