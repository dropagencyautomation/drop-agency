# Frentes 4 e 5 — Resumo automático do lead + notificação de lead qualificado para a Camila

Data: 2026-07-03
Status: aprovado para plano de implementação

## Contexto

Continua a sequência de frentes (1: tom de conversa ✅, 6/7: Redis lock+agrupamento ✅). Esta cobre os itens 5, 6 e 7 do pedido original: resumo automático do lead a cada 2 mensagens, a segunda mensagem fixa de handoff, e a notificação para a Camila com resumo + orientações.

## Decisão de correção encontrada durante o design (afeta código já implementado)

A flag `bot:sending:{phone}` hoje só é setada dentro de `sendSplitText` (`lib/uazapi/client.ts`). A nova mensagem fixa de handoff ("Obrigado pelo contato...") vai ser enviada via `sendText` direto, fora de `sendSplitText` — se a flag não cobrir esse envio, o eco do webhook dessa mensagem seria mal classificado como humano manual, criando um `human_lock` indevido logo após o handoff (o pior momento possível, pois travaria a IA justo quando a Camila ainda não assumiu de verdade).

**Correção:** mover a marcação da flag para dentro de `sendText` (a função de mais baixo nível, usada por todo envio ao WhatsApp), com TTL fixo curto (15s, renovado a cada chamada). Isso cobre qualquer envio do bot, incluindo blocos múltiplos (`sendSplitText`), a nova mensagem fixa, e as notificações para a Camila. Remove a necessidade do cálculo de TTL por quantidade de blocos (`botSendingTtlSeconds`), que fica obsoleto e será removido.

## Frente 5 — Resumo automático do lead a cada 2 mensagens

**Gatilho:** a cada 2 mensagens do lead (papel `user` no `conversation_history`), ou seja, quando `finalHistory.filter(m => m.role === 'user').length % 2 === 0` logo após a IA responder.

**Geração:** nova função `generateLeadSummary(history, qualificationData): Promise<string>` em `lib/openai/agent.ts`, com um novo `SUMMARY_SYSTEM_PROMPT` dedicado, pedindo uma frase única (uma linha) descrevendo o lead com base na conversa e nos dados já qualificados. Mesma robustez de falha das funções existentes (`extractQualificationData`): erro/parse inválido retorna string vazia, não quebra o fluxo.

**Persistência:** nova coluna `leads.summary TEXT`, adicionada por uma migração nova (`supabase/migrations/002_lead_summary.sql`). Atualizada junto com o resto do `leadUpdate` já existente no webhook, só quando o gatilho acima for verdadeiro (não sobrescreve com string vazia se a geração falhar).

## Frente 4 (parte 2) — Segunda mensagem fixa + notificação da Camila

**Sequência ao acionar `shouldHandoff`** (mesma condição já existente: `current_step === 'routing'` OU `[handoff]`/`vou transferir` na resposta):
1. `sendSplitText(phone, reply)` já envia a resposta da IA (que inclui a frase "Perfeito, a Camila vai entrar em contato..." quando aplicável, já implementado na Frente 1).
2. Envia a mensagem fixa adicional via `sendText(phone, 'Obrigado pelo contato, em breve vamos falar com você')`.
3. Gera as orientações para a Camila: nova função `generateHandoffGuidance(history, qualificationData): Promise<string>` em `lib/openai/agent.ts`, com um novo `GUIDANCE_SYSTEM_PROMPT` pedindo um parágrafo cobrindo: personalidade do lead, nome (se identificado), nicho/segmento, principais dores, nível de interesse, dados pessoais/comerciais entendidos, e a melhor abordagem para a Camila continuar.
4. Notifica a Camila: nova função `notifyQualifiedLead(leadPhone, summary, guidance)` em `lib/uazapi/client.ts`, substituindo `notifyHandoff`/`buildHandoffSummary` (removidos, ficavam com um formato antigo não usado mais). Envia para `process.env.ADMIN_PHONE` (mesmo env var já existente — o usuário deve configurar com o número da Camila, `5511989869931`) o texto exato:

```
✅ NOVO LEAD QUALIFICADO

o lead: {leadPhone} foi qualificado pela agente de IA Carol

resumo: {summary}

orientações: {guidance}

--------------------------------------------------
```

Onde `{summary}` é o resumo mais recente já calculado pela Frente 5 (reaproveitado, sem gerar de novo), e `{guidance}` vem de `generateHandoffGuidance`.

## Limitação conhecida (fora de escopo, não corrigir agora)

`shouldHandoff` pode continuar `true` em mensagens futuras enquanto `current_step` permanecer `'routing'`, o que reenviaria a notificação/mensagem fixa a cada nova mensagem do lead nesse estado — hoje isso já seria parcialmente coberto pelo `human_lock` (se a Camila assumir manualmente, a IA para de processar), mas não é uma proteção total. Não faz parte do pedido original corrigir isso agora; registrar como possível frente futura se virar problema prático.

## Testes / verificação

- Testar `generateLeadSummary`/`generateHandoffGuidance` isoladamente com uma transcrição de teste (extensão do padrão usado em `scripts/replay-test1.ts`), conferindo que retornam texto coerente e não quebram com histórico vazio.
- Rodar `scripts/replay-test1.ts` e confirmar que, a cada 2 mensagens do lead, um resumo é logado/calculado; e que ao chegar no ponto de handoff, a segunda mensagem fixa aparece e as orientações são geradas.
- Verificar manualmente que a migração `002_lead_summary.sql` roda sem erro no Supabase (coluna nova, sem quebrar dados existentes — `ALTER TABLE ... ADD COLUMN` é seguro em tabela já populada).
- Confirmar que a correção da flag `bot:sending` movida para `sendText` não quebra os testes já existentes de `scripts/test-split-blocks.ts` (ajustar o teste removendo a asserção de `botSendingTtlSeconds`, que deixa de existir).
