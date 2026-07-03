# Frentes 6 e 7 — Redis: lock de 15min quando humano assume + agrupamento de mensagens do lead

Data: 2026-07-03
Status: aprovado para plano de implementação (infra Redis já decidida: VPS Easypanel)

## Contexto

Segue a Frente 1 (tom de conversa, já implementada). O PostgreSQL continua sendo o Supabase já configurado (sem infra nova) — isso fica para uma frente futura de reestruturação de memória/janela de contexto. Esta spec cobre as duas frentes que dependem de Redis, que ficará hospedado na VPS Easypanel do usuário. As duas comparilham a mesma infra (cliente Redis, env var), por isso vão num spec só.

Arquivo principal afetado: `app/api/webhook/whatsapp/route.ts`. Novo arquivo: `lib/redis/client.ts`.

## Decisão de infraestrutura

- Biblioteca: `ioredis` (cliente Node maduro, suporta `SET ... EX`, reconexão automática, TLS).
- Env var nova: `REDIS_URL` (ex: `redis://default:senha@host:porta`, ou `rediss://` se TLS). Adicionar ao `.env.local.example`.
- `lib/redis/client.ts`: singleton cacheado em `globalThis` (mesmo padrão usado para evitar múltiplas conexões em hot-reload do Next.js dev), exportando uma função `getRedis()`.

## Problema técnico central: distinguir eco do próprio bot de mensagem humana manual

O webhook da uazapi recebe um evento `fromMe: true` tanto quando:
- (a) o **próprio bot** envia uma resposta via `/send/text` (a uazapi ecoa a mensagem enviada como evento de webhook, porque WhatsApp multi-device sincroniza tudo que sai daquele número), quanto quando
- (b) um **humano de verdade** manda mensagem manualmente pelo WhatsApp conectado (celular/app).

Hoje (`route.ts:61`) qualquer `fromMe` é apenas descartado, sem distinguir os dois casos — o que é seguro hoje (nada depende disso), mas não é suficiente para o lock de 15 minutos: se tratássemos todo `fromMe` como "humano assumiu", o próprio bot se bloquearia a cada mensagem que manda.

**Solução: flag "bot enviando" no Redis, com expiração automática.**
- Antes de enviar os blocos (`sendSplitText`), gravar `SET bot:sending:{wa_chatid} 1 EX <ttl>`, onde `ttl` cobre o tempo total estimado de envio (soma dos delays entre blocos) mais uma margem de segurança de ~8s para o eco do webhook chegar.
- Não é necessário apagar a chave depois do envio — ela expira sozinha, o que evita condição de corrida entre "apagar antes do eco chegar" e "o eco chega".
- No webhook, ao receber `fromMe: true`:
  - Se `bot:sending:{wa_chatid}` existir no Redis → é eco do próprio bot, ignora silenciosamente (como hoje).
  - Se não existir → é um humano mandando mensagem manual de verdade → aciona o lock (próxima seção).

Isso é uma heurística baseada em janela de tempo, não em correspondência exata de ID de mensagem (a uazapi não documenta claramente um campo para isso). Risco residual: se um humano mandar uma mensagem manual nos poucos segundos em que o bot está enviando blocos para o mesmo lead, ela pode ser confundida com eco e não travar a conversa. Considerado aceitável dado o uso esperado (times raramente respondem manualmente no exato segundo em que o bot está digitando).

## Frente 6 — Lock de 15 minutos quando humano assume

**Fluxo no webhook**, inserido logo após o parse de `wa_chatid`/whitelist, antes de qualquer outra lógica:

1. `fromMe` verdadeiro (confirmado como humano real, não eco — ver seção acima):
   - `SET human_lock:{wa_chatid} 1 EX 900` (grava ou renova os 15 minutos a cada nova mensagem humana; mensagens do lead durante o lock **não** renovam o timer, só mensagens humanas renovam).
   - Registra a mensagem no `conversation_history` da conversa como turno `assistant` (mesmo papel usado para respostas da IA, para que o histórico fique coerente e a IA "saiba" o que já foi dito quando o lock expirar e ela retomar).
   - Retorna `{ ok: true }` sem chamar `processMessage`.
2. Mensagem normal do lead (`fromMe` falso): antes do fluxo de IA, checa `EXISTS human_lock:{wa_chatid}`.
   - Se existir → grava a mensagem do lead no histórico normalmente (para não perder contexto), mas **não** chama `processMessage` nem envia resposta. Retorna `{ ok: true }`.
   - Se não existir → segue o fluxo normal (Frente 7 abaixo).

Isso substitui o gate de `human_takeover` que hoje está desativado (`route.ts:124-134`) por um mecanismo automático baseado em Redis, sem precisar do botão manual do CRM (que continua existindo à parte, mas não é o foco desta frente).

## Frente 7 — Agrupamento de mensagens do lead (substitui o debounce atual)

Hoje (`route.ts:154-171`) cada mensagem recebida dorme 5s dentro da própria requisição e depois relê o Supabase para ver se uma mensagem mais nova chegou; se sim, essa invocação desiste e deixa a mais recente processar tudo. Esse padrão já funciona (é um debounce por invocação, coordenado via timestamp no Supabase) — a mudança pedida é: (a) usar 30s em vez de 5s, e (b) usar Redis em vez de reler o Supabase para a checagem "chegou algo mais novo?".

**Novo fluxo:**
1. Ao registrar a mensagem do lead no `conversation_history` (isso continua sendo feito imediatamente, como hoje, para não perder nada), grava também `SET latest_msg:{wa_chatid} {timestamp} EX 60` no Redis (a chave em si já serve de marcador; TTL de 60s é só limpeza, não é o mecanismo de decisão).
2. `await sleep(30000)`.
3. Lê `GET latest_msg:{wa_chatid}` do Redis. Se o valor não for igual ao `timestamp` desta invocação → chegou mensagem mais nova nesse meio tempo → esta invocação aborta e retorna `{ ok: true }`, deixando a invocação mais recente (que vai completar seu próprio sleep de 30s sem ser superada) processar tudo.
4. Se o valor bater → é a invocação mais recente → segue para juntar as mensagens não respondidas ainda (mesma lógica de slice por `lastAssistantIdx` que já existe, lendo do Supabase) e chama `processMessage`.

Isso mantém a arquitetura atual (espera bloqueada dentro da própria requisição, sem necessidade de worker separado ou Redis keyspace notifications, que exigiriam configuração adicional no Redis e um processo persistente ouvindo eventos) e troca apenas o mecanismo de "houve algo mais novo?" de uma leitura no Postgres para uma leitura no Redis (mais rápida, e desacopla esse controle de fluxo do dado persistente).

**Alternativa rejeitada por ora:** lista/buffer de mensagens dentro do Redis (`RPUSH`) com Redis keyspace notifications para disparar o processamento no fim do silêncio. Mais correta em tese, mas exige um processo de background separado do Next.js (webhook é request/response) e configuração de `notify-keyspace-events` no Redis, que a maioria dos provedores gerenciados não habilita por padrão. Pode ser revisitada se no futuro o app ganhar um worker dedicado.

## Resumo do fluxo completo no webhook (ordem final)

```
1. Parse payload → wa_chatid, phone, message
2. Whitelist check
3. fromMe?
   a. bot:sending:{wa_chatid} existe? → ignora (eco do bot)
   b. senão → SET human_lock:{wa_chatid} EX 900, grava no histórico como turno assistant, retorna
4. human_lock:{wa_chatid} existe? → grava mensagem do lead no histórico, retorna (sem IA)
5. Grava mensagem do lead no histórico + SET latest_msg:{wa_chatid} EX 60
6. sleep(30s)
7. GET latest_msg:{wa_chatid} == meu timestamp? não → retorna (invocação superada)
8. sim → junta mensagens não respondidas, chama processMessage
9. sendSplitText → SET bot:sending:{wa_chatid} EX <ttl> antes de enviar
10. shouldHandoff? → notifyHandoff (Camila) — fora do escopo desta frente (ver Frente 4)
```

## Testes / verificação

- Testar manualmente: mandar mensagem manual pelo WhatsApp conectado (não pelo bot) para um número de teste e confirmar que `human_lock` é criado no Redis (`redis-cli GET human_lock:...`) e que o bot não responde a mensagens do lead durante os 15 minutos.
- Confirmar que o próprio envio do bot (`sendSplitText`) NÃO cria lock (testar uma conversa normal ponta a ponta).
- Testar agrupamento: mandar 3-4 mensagens seguidas em menos de 30s e confirmar uma única resposta combinada, com log mostrando as invocações intermediárias sendo abortadas.
- Confirmar que após o lock expirar (15min sem mensagem humana), o bot volta a responder normalmente ao lead.

## Riscos / observações

- Heurística de eco (janela de tempo) pode falhar em casos raros de coincidência de timing — ver seção "Problema técnico central".
- `ioredis` precisa de rede liberada entre o app (Next.js) e a VPS Easypanel onde o Redis vai rodar; confirmar isso na hora do deploy.
- Nenhuma mudança de schema no Supabase é necessária para esta frente.
