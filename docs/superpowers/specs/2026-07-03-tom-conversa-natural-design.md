# Frente 1 — Tom de conversa mais natural, quebra de blocos e frase de handoff

Data: 2026-07-03
Status: aprovado para plano de implementação

## Contexto

Este é o primeiro de 7 blocos de trabalho independentes para deixar o agente de IA (Carol, `lib/openai/agent.ts`) menos engessado nas respostas via WhatsApp. As outras 6 frentes (resumo automático do lead, tool de notificação para a Camila, memória em PostgreSQL com janela de 20 mensagens, lock de 15min no Redis quando um humano assume a conversa, e agrupamento de mensagens do lead via Redis) serão desenhadas em specs separados.

Esta frente cobre apenas os ajustes de **prompt** e uma pequena mudança de **código de envio de mensagem**, sem dependência de infraestrutura nova (Redis/Postgres). É a mudança de menor risco e maior impacto perceptível imediato para quem conversa com o agente.

## Escopo

1. Respostas mais curtas e menos formais.
2. Uso do nome do lead só em momentos estratégicos, não em toda mensagem.
3. Menos agradecimentos repetitivos/genéricos.
4. Quebra de blocos sem ponto final no fim de cada bloco.
5. Primeira frase do handoff ("Perfeito, a Camila vai entrar em contato...") gerada pelo próprio LLM como parte da resposta com `[HANDOFF]`.

Fora de escopo (entram em frentes futuras): a segunda mensagem fixa de handoff ("Obrigado pelo contato, em breve vamos falar com você") e o disparo da notificação para a Camila — esses dependem de código novo acionado após a detecção de `[HANDOFF]`, tratados na Frente 4.

## Mudanças no `SYSTEM_PROMPT` (`lib/openai/agent.ts`)

### 1. Seção "COMO VOCÊ DEVE SE COMUNICAR" (hoje linhas 91-104)

Adicionar, dentro do bloco `TOM`, regras explícitas de tamanho e agradecimento, e dentro do bloco `FORMATO`, ajustar a regra de quebra em blocos (item 4) e adicionar a regra de uso do nome (hoje mencionada só na seção IDENTIDADE, linha 12).

Novo conteúdo do bloco `TOM` (substitui linhas 94-98):
```
TOM:
- Consultivo, estratégico, próximo, humano. Nunca robótico.
- Respostas curtas, como uma conversa real de WhatsApp. Prefira 1 frase objetiva a um parágrafo explicativo. Textos longos e institucionais são exceção, não regra.
- Use o nome do lead só em momentos estratégicos (abertura, uma pergunta-chave, fechamento), nunca em quase toda mensagem. Errado: "Mateus, entendi. Mateus, me fala uma coisa." Certo: "Entendi. Me fala uma coisa: hoje vocês já usam algum sistema ou fazem isso mais manualmente?"
- Não agradeça repetidamente por cada informação recebida. Frases como "obrigado pela informação" ou "agradeço por compartilhar" são banidas como resposta padrão. Agradeça só quando fizer sentido genuíno (ex: o lead resolveu algo, fechou um combinado).
- Valide com sobriedade. Evite euforia ou elogios repetidos ("Que bacana!", "Ótima pergunta!") a cada resposta, reserve entusiasmo pra quando realmente fizer sentido.
- No máximo 1 emoji por mensagem, e só quando fizer sentido.
- Nunca pressione, nunca insista, nunca soe desesperado.
```

Ajuste na regra de blocos dentro de `FORMATO` (hoje linha 104): manter a orientação de quebrar em até 3 blocos curtos separados por linha em branco, mas reforçar que isso é exceção para respostas longas — a resposta padrão deve ser curta o suficiente para não precisar de blocos.

### 2. Seção "HANDOFF PARA CAMILA" (hoje linha 200)

Trocar a linha final genérica:
```
Ao fazer handoff, informe o lead de forma elegante que a Camila dará continuidade ao atendimento em breve.
```
por uma instrução com a frase exata a ser usada quando o lead aceitar falar com um consultor:
```
Quando o lead concordar em falar com um consultor da Drop, use exatamente esta frase (ou uma variação mínima e natural dela) como parte da resposta com [HANDOFF]: "Perfeito, a Camila vai entrar em contato com você pra te ajudar melhor". Para os demais casos de handoff (gatilhos técnicos, dúvidas fora de escopo), informe o lead de forma elegante que a Camila dará continuidade ao atendimento em breve, sem precisar repetir essa frase literal.
```

## Mudança de código — quebra de blocos sem ponto final

Arquivo: `lib/uazapi/client.ts`, função `splitIntoBlocks` (linhas 47-75) e/ou `sendSplitText` (linhas 82-94).

Depois que o texto é dividido em blocos (por parágrafo e por frase, lógica existente inalterada), cada bloco tem o ponto final (`.`) removido do final, se houver — apenas o ponto final simples, nunca `!`, `?`, `…` ou `...`. Isso é uma transformação pura de string aplicada a cada bloco antes do envio, sem alterar os pontos de quebra já existentes (`MAX_BLOCK_LENGTH`, separação por sentença, etc.).

Exemplo:
- Bloco gerado: `"Entendi."` → enviado como `"Entendi"`
- Bloco gerado: `"Hoje vocês perdem muitos leads por demora no atendimento."` → enviado como `"Hoje vocês perdem muitos leads por demora no atendimento"`
- Bloco gerado: `"Vocês já usam algum sistema?"` → enviado sem alteração (termina em `?`)

## Testes / verificação

- `scripts/replay-test1.ts` já existe para rodar a conversa de teste contra `processMessage()` — usar para conferir qualitativamente o novo tom (respostas mais curtas, nome usado com moderação, sem agradecimentos repetidos).
- Teste unitário/manual da remoção de ponto final: confirmar que blocos terminados em `.` perdem o ponto, e blocos terminados em `!`, `?`, `...` permanecem inalterados.
- Conferir visualmente (via replay ou webhook de teste) que a frase de handoff aparece literalmente ("Perfeito, a Camila vai entrar em contato com você pra te ajudar melhor") quando o lead aceita falar com consultor.

## Riscos / observações

- Mudança de prompt não é determinística — o LLM pode não seguir a regra de uso do nome ou de agradecimento com 100% de consistência. Isso é esperado e aceitável; o objetivo é reduzir a frequência, não eliminar 100%.
- A remoção do ponto final é uma mudança puramente sintática de baixo risco, não afeta a lógica de qualificação, score ou handoff.
