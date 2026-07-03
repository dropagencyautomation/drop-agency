# Tom de Conversa Natural — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deixar as respostas do agente Carol mais curtas, naturais e menos repetitivas (nome, agradecimentos), e remover o ponto final de cada bloco enviado por WhatsApp.

**Architecture:** Edição de conteúdo em `SYSTEM_PROMPT` (`lib/openai/agent.ts`) e uma função pura nova em `lib/uazapi/client.ts` que remove o ponto final de cada bloco antes do envio.

**Tech Stack:** TypeScript, Next.js. Sem dependências novas.

## Global Constraints

- Spec de referência: `docs/superpowers/specs/2026-07-03-tom-conversa-natural-design.md`
- Não remover `!`, `?`, `…` (elipse unicode) ou `...` (três pontos) — só o ponto final simples.
- Não alterar a lógica de quebra de blocos existente (`MAX_BLOCK_LENGTH`, agrupamento por frase).
- Frase de handoff deve aparecer literal (ou variação mínima natural): "Perfeito, a Camila vai entrar em contato com você pra te ajudar melhor".

---

### Task 1: Ajustar tom, tamanho de resposta, uso do nome e agradecimentos no `SYSTEM_PROMPT`

**Files:**
- Modify: `lib/openai/agent.ts:94-104`

**Interfaces:**
- Nenhuma interface nova — só conteúdo de string.

- [ ] **Step 1: Substituir o bloco `TOM` e a regra de blocos em `FORMATO`**

Em `lib/openai/agent.ts`, localizar (linhas 94-104):

```
TOM:
- Consultivo, estratégico, próximo, humano. Nunca robótico.
- Valide com sobriedade. Evite euforia ou elogios repetidos ("Que bacana!", "Ótima pergunta!") a cada resposta, reserve entusiasmo pra quando realmente fizer sentido.
- No máximo 1 emoji por mensagem, e só quando fizer sentido.
- Nunca pressione, nunca insista, nunca soe desesperado.

FORMATO (regras rígidas, isso é WhatsApp, não documento):
- Nunca use o caractere "—" (travessão). Use vírgula, ponto ou reticências.
- Nunca escreva "bem-vindo(a)" ou qualquer saudação com "(a)". Escolha uma forma direta.
- Nunca use listas numeradas com títulos em negrito no corpo da mensagem. Se precisar listar algo, use no máximo 2-3 itens curtos, sem formatação de documento.
- Se a resposta for longa, quebre em até 3 blocos curtos separando com uma linha em branco entre eles (o sistema envia cada bloco como mensagem separada, com pausa entre elas, simulando digitação). Não force isso em respostas curtas. Nunca use marcadores ou símbolos artificiais para separar os blocos, só a linha em branco.
```

Substituir por:

```
TOM:
- Consultivo, estratégico, próximo, humano. Nunca robótico.
- Respostas curtas, como uma conversa real de WhatsApp. Prefira 1 frase objetiva a um parágrafo explicativo. Textos longos e institucionais são exceção, não regra.
- Use o nome do lead só em momentos estratégicos (abertura, uma pergunta-chave, fechamento), nunca em quase toda mensagem. Errado: "Mateus, entendi. Mateus, me fala uma coisa." Certo: "Entendi. Me fala uma coisa: hoje vocês já usam algum sistema ou fazem isso mais manualmente?"
- Não agradeça repetidamente por cada informação recebida. Frases como "obrigado pela informação" ou "agradeço por compartilhar" são banidas como resposta padrão. Agradeça só quando fizer sentido genuíno (ex: o lead resolveu algo, fechou um combinado).
- Valide com sobriedade. Evite euforia ou elogios repetidos ("Que bacana!", "Ótima pergunta!") a cada resposta, reserve entusiasmo pra quando realmente fizer sentido.
- No máximo 1 emoji por mensagem, e só quando fizer sentido.
- Nunca pressione, nunca insista, nunca soe desesperado.

FORMATO (regras rígidas, isso é WhatsApp, não documento):
- Nunca use o caractere "—" (travessão). Use vírgula, ponto ou reticências.
- Nunca escreva "bem-vindo(a)" ou qualquer saudação com "(a)". Escolha uma forma direta.
- Nunca use listas numeradas com títulos em negrito no corpo da mensagem. Se precisar listar algo, use no máximo 2-3 itens curtos, sem formatação de documento.
- Respostas curtas não precisam de blocos. Só quebre em até 3 blocos curtos (separados por linha em branco) quando a resposta for realmente longa e não puder ser resumida. O sistema envia cada bloco como mensagem separada, com pausa entre elas, simulando digitação. Nunca use marcadores ou símbolos artificiais para separar os blocos, só a linha em branco.
```

- [ ] **Step 2: Verificar visualmente**

Rodar: `npx tsx scripts/replay-test1.ts`
Esperado: respostas do agente mais curtas que a transcrição original, nome do lead usado com moderação (não em toda resposta), sem frases de agradecimento repetidas.

- [ ] **Step 3: Commit**

```bash
git add lib/openai/agent.ts
git commit -m "feat: agente responde mais curto, usa nome com moderacao e reduz agradecimentos"
```

---

### Task 2: Fixar a frase de handoff quando o lead aceita falar com consultor

**Files:**
- Modify: `lib/openai/agent.ts:200`

**Interfaces:**
- Nenhuma interface nova.

- [ ] **Step 1: Substituir a linha final da seção "HANDOFF PARA CAMILA"**

Em `lib/openai/agent.ts`, localizar (linha 200, dentro do template string do `SYSTEM_PROMPT`):

```
Ao fazer handoff, informe o lead de forma elegante que a Camila dará continuidade ao atendimento em breve.`
```

Substituir por:

```
Quando o lead concordar em falar com um consultor da Drop, use exatamente esta frase (ou uma variação mínima e natural dela) como parte da resposta com [HANDOFF]: "Perfeito, a Camila vai entrar em contato com você pra te ajudar melhor". Para os demais casos de handoff (gatilhos técnicos, dúvidas fora de escopo), informe o lead de forma elegante que a Camila dará continuidade ao atendimento em breve, sem precisar repetir essa frase literal.`
```

Atenção: a crase (`` ` ``) no final fecha o template string do `SYSTEM_PROMPT` — manter exatamente no mesmo lugar (fim da nova frase), não duplicar nem remover.

- [ ] **Step 2: Verificar visualmente**

Rodar: `npx tsx scripts/replay-test1.ts`
Esperado: quando a conversa de teste chegar ao ponto de aceitar reunião/consultor, a resposta com `[HANDOFF]` inclui a frase "Perfeito, a Camila vai entrar em contato com você pra te ajudar melhor" (ou variação mínima).

- [ ] **Step 3: Commit**

```bash
git add lib/openai/agent.ts
git commit -m "feat: fixa frase de handoff quando lead aceita falar com consultor"
```

---

### Task 3: Remover ponto final de cada bloco antes do envio

**Files:**
- Modify: `lib/uazapi/client.ts:47-75`
- Test: `scripts/test-split-blocks.ts` (novo)

**Interfaces:**
- Produces: `stripTrailingPeriod(block: string): string` (exportada de `lib/uazapi/client.ts`) — remove `.` final simples, preserva `!`, `?`, `…`, `...`.
- `splitIntoBlocks(text: string): string[]` continua com a mesma assinatura, mas o array retornado já vem com o ponto final de cada bloco removido.

- [ ] **Step 1: Escrever o teste (vai falhar, funções ainda não existem/não fazem o strip)**

Criar `scripts/test-split-blocks.ts`:

```ts
// Testa splitIntoBlocks e stripTrailingPeriod, incluindo a remocao do ponto
// final de cada bloco (sem remover "!", "?", "...", "…").
//
// Uso: npx tsx scripts/test-split-blocks.ts

import assert from 'node:assert/strict'
import { splitIntoBlocks, stripTrailingPeriod } from '../lib/uazapi/client'

assert.equal(stripTrailingPeriod('Entendi.'), 'Entendi')
assert.equal(stripTrailingPeriod('Vocês já usam algum sistema?'), 'Vocês já usam algum sistema?')
assert.equal(stripTrailingPeriod('Isso é ótimo!'), 'Isso é ótimo!')
assert.equal(stripTrailingPeriod('Vamos ver...'), 'Vamos ver...')
assert.equal(stripTrailingPeriod('Vamos ver…'), 'Vamos ver…')
assert.equal(stripTrailingPeriod('Sem pontuação'), 'Sem pontuação')

const blocks = splitIntoBlocks(
  'Entendi.\n\nHoje vocês perdem muitos leads por demora no atendimento.'
)
assert.deepEqual(blocks, [
  'Entendi',
  'Hoje vocês perdem muitos leads por demora no atendimento',
])

console.log('OK - todos os testes de splitIntoBlocks/stripTrailingPeriod passaram')
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx tsx scripts/test-split-blocks.ts`
Expected: erro de import (`stripTrailingPeriod` não exportado por `lib/uazapi/client.ts`) ou `AssertionError` (blocos ainda com ponto final).

- [ ] **Step 3: Implementar `stripTrailingPeriod` e aplicar no retorno de `splitIntoBlocks`**

Em `lib/uazapi/client.ts`, adicionar logo antes de `export function splitIntoBlocks`:

```ts
/**
 * Remove o ponto final simples do fim de um bloco, sem afetar "!", "?",
 * "…" (elipse unicode) ou "..." (sequência de pontos, ex: fim de "...").
 */
export function stripTrailingPeriod(block: string): string {
  return block.replace(/(?<!\.)\.$/, '')
}
```

E trocar a última linha de `splitIntoBlocks` (hoje `return blocks`) por:

```ts
  return blocks.map(stripTrailingPeriod)
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx tsx scripts/test-split-blocks.ts`
Expected: `OK - todos os testes de splitIntoBlocks/stripTrailingPeriod passaram`

- [ ] **Step 5: Commit**

```bash
git add lib/uazapi/client.ts scripts/test-split-blocks.ts
git commit -m "feat: remove ponto final de cada bloco antes do envio no whatsapp"
```

---

## Self-Review Notes

- Cobertura da spec: itens 1-4 (tamanho, nome, agradecimento, quebra de blocos) e frase de handoff (item 6, primeira parte) — todos cobertos por Task 1/2/3. Segunda mensagem fixa de handoff e notificação da Camila ficam para a Frente 4 (spec futuro).
- Sem placeholders — todo código e teste estão completos acima.
- Tipos consistentes: `stripTrailingPeriod` e `splitIntoBlocks` mantêm assinaturas usadas por `sendSplitText` (não muda).
