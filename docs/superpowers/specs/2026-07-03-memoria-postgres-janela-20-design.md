# Frente 8 — Memória do agente em PostgreSQL, janela de 20 mensagens por wa_chatid

Data: 2026-07-03
Status: aprovado para plano de implementação

## Contexto

Última frente do pedido original. O PostgreSQL já é o Supabase existente — não há infra nova. Hoje a "memória" da IA é o campo `ai_conversations.conversation_history` (JSONB, array ilimitado, reescrito por inteiro a cada mensagem).

## Descoberta que muda o desenho

Pesquisei como o CRM (`app/(crm)/crm/page.tsx`) usa esses dados antes de desenhar a mudança, e descobri:

- O chat do CRM **já renderiza a partir da tabela `interactions`** (`direction`, `ai_generated`, `content`, `created_at`), não de `conversation_history`. O campo `conversation_history` só é lido/escrito hoje pelo webhook e usado como memória da IA em `lib/openai/agent.ts` — nada mais no sistema depende dele.
- Existe uma lacuna real: quando um humano responde manualmente pelo WhatsApp conectado (branch `isFromMe` que criamos na Frente 6), a mensagem só é gravada em `conversation_history`, nunca em `interactions` — ou seja, hoje essa mensagem **não aparece no chat do CRM**. Bug pré-existente que esta frente corrige de graça.
- A função "responder como humano" do CRM (`sendMessage`) só grava em `interactions`, nunca em `conversation_history` — ou seja, hoje a IA nunca "vê" respostas manuais feitas pelo CRM. Também corrigido por esta mudança (unificando a fonte).

**Decisão:** em vez de criar uma tabela nova, a memória da IA passa a ser lida diretamente de `interactions` (que já é Postgres via Supabase, já é a fonte de verdade do CRM, e já registra toda mensagem trocada), com janela das últimas 20 linhas por lead. Isso unifica CRM e memória da IA na mesma fonte, sem duplicar dado.

`ai_conversations.conversation_history` (JSONB) deixa de ser lido/escrito pelo webhook — a coluna continua existindo no banco (não é destrutivo, dado histórico não é apagado), só para de ser a fonte usada daqui pra frente. `ai_conversations` continua guardando `qualification_data` e `current_step` (não muda).

## Identificação do lead (`wa_chatid`)

O pedido original especifica `wa_chatid` como variável de identificação. Na prática, o webhook já resolve `wa_chatid` → `phone` → `lead_id` (via `ai_conversations.whatsapp_number`) logo no início do fluxo — a janela de mensagens é buscada por `lead_id` (chave já resolvida a partir do `wa_chatid` recebido no payload), não é necessário guardar `wa_chatid` na tabela `interactions`.

## Mudanças

### 1. Janela de 20 mensagens a partir de `interactions`

Nova função auxiliar no webhook: busca as últimas 20 linhas de `interactions` do lead (`channel = 'whatsapp'`, ordenado por `created_at`), mapeando `direction: 'inbound' → role: 'user'` e `direction: 'outbound' → role: 'assistant'` (independente de `ai_generated` — uma resposta humana manual também conta como turno "assistant" para o contexto da IA).

### 2. Corrigir o branch `fromMe` (Frente 6) para gravar em `interactions`

Hoje esse branch grava a mensagem humana manual só em `conversation_history`. Passa a inserir em `interactions` (`direction: 'outbound'`, `ai_generated: false`) — isso corrige a visibilidade no CRM e garante que a próxima janela de 20 mensagens já inclua essa resposta humana como contexto.

### 3. Remover a leitura/escrita de `conversation_history` do webhook

Toda a lógica de `historyWithUser`, `freshHistory` (via `ai_conversations`), `finalHistory` baseada em JSONB é substituída pela janela lida de `interactions`. `processMessage`, `generateLeadSummary` e `generateHandoffGuidance` continuam recebendo o mesmo formato de array `{role, content, timestamp}` que já aceitam — não precisam mudar de assinatura, só a origem dos dados muda.

### 4. Lógica de "mensagens ainda não respondidas" (agrupamento)

Mantém a mesma lógica já existente (encontrar o último turno `assistant` na janela e pegar as mensagens `user` depois dele como `combinedMessage`), só que operando sobre as linhas vindas de `interactions` em vez do array JSONB.

## Fora de escopo / observações

- Não vou dropar a coluna `conversation_history` — fica sem uso, mas presente (não destrutivo). Uma limpeza futura (migração dropando a coluna) pode ser feita depois de confirmar que nada mais depende dela.
- O toggle manual "Pausar IA / Retomar IA" do CRM (`human_takeover` em `ai_conversations`) é um mecanismo diferente do `human_lock` automático via Redis (Frente 6) — esta frente não mexe nisso, os dois continuam coexistindo.
- Limite de 20 mensagens pode, em teoria, cortar uma sequência muito longa de mensagens do lead sem resposta (ex: mais de 20 mensagens seguidas sem a IA responder) — cenário improvável dado o agrupamento de 30s já existente (Frente 7), não vou tratar esse caso extremo agora.

## Testes / verificação

- Rodar `npx tsc --noEmit` e `npm run build` após a mudança.
- Testar manualmente: enviar mais de 20 mensagens numa conversa de teste e confirmar que a IA responde usando só o contexto das últimas 20 (sem erro, sem histórico cortado de forma quebrada).
- Confirmar que uma mensagem enviada manualmente pelo WhatsApp conectado (fromMe humano) aparece no chat do CRM (antes não aparecia).
- Confirmar visualmente via `scripts/replay-test1.ts` adaptado (ou teste manual) que o comportamento de qualificação/handoff continua igual.
