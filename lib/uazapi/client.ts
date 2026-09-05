import { getRedis } from '@/lib/redis/client'
import { botSendingKey } from '@/lib/agent/keys'

const BASE_URL = process.env.UAZAPI_BASE_URL!
const TOKEN = process.env.UAZAPI_TOKEN!
const INSTANCE = process.env.UAZAPI_INSTANCE!

// Teto padrão por chamada: sem ele uma Uazapi pendurada segurava o webhook indefinidamente.
const DEFAULT_TIMEOUT_MS = 20000

async function request(path: string, body?: object, timeoutMs: number = DEFAULT_TIMEOUT_MS) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'token': TOKEN,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Uazapi error: ${res.status} ${await res.text()}`)
  return res.json()
}

export function getRandomTypingDelay(): number {
  return Math.floor(Math.random() * (4000 - 2000 + 1)) + 2000
}

export async function sendText(phone: string, text: string) {
  // Marca que o bot está enviando para este número, para o webhook não
  // confundir o eco do próprio envio com uma mensagem humana manual.
  // TTL curto, renovado a cada chamada — cobre qualquer envio (blocos
  // múltiplos, mensagens fixas, notificações), sem precisar prever a
  // duração total antecipadamente.
  // Guardamos o TEXTO enviado (conjunto com TTL): o webhook reconhece o eco
  // comparando o conteúdo, e não engole mais a atendente que digita durante o envio.
  try {
    await getRedis().multi().sadd(botSendingKey(phone), text).expire(botSendingKey(phone), 90).exec()
  } catch (e) {
    console.error('[UAZAPI] bot:sending falhou', phone, e)
  }

  return request('/send/text', {
    number: phone,
    text,
    delay: getRandomTypingDelay(),
  })
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// Tamanho máximo aproximado de um bloco antes de quebrarmos em frases.
const MAX_BLOCK_LENGTH = 220

// Delay aleatório entre 2 e 3 segundos, aplicado entre um bloco e o próximo.
function getRandomBlockDelay(): number {
  return Math.floor(Math.random() * (3000 - 2000 + 1)) + 2000
}

/**
 * Remove o ponto final simples do fim de um bloco, sem afetar "!", "?",
 * "…" (elipse unicode) ou "..." (sequência de pontos, ex: fim de "...").
 */
export function stripTrailingPeriod(block: string): string {
  return block.replace(/(?<!\.)\.$/, '')
}

/**
 * Quebra a resposta da IA em blocos menores, mantendo o sentido de cada bloco.
 * - Respeita as quebras de linha que a própria IA já sinalizou (parágrafos).
 * - Nunca corta uma frase no meio: parágrafos longos são divididos por
 *   pontuação (. ! ? …), agrupando frases inteiras até o limite de tamanho.
 */
export function splitIntoBlocks(text: string): string[] {
  const paragraphs = text.split(/\n+/).map(p => p.trim()).filter(Boolean)

  const blocks: string[] = []
  for (const paragraph of paragraphs) {
    if (paragraph.length <= MAX_BLOCK_LENGTH) {
      blocks.push(paragraph)
      continue
    }

    // Extrai frases inteiras (cada frase termina em pontuação ou no fim do texto).
    const sentences =
      paragraph.match(/[^.!?…]+[.!?…]+|[^.!?…]+$/g)?.map(s => s.trim()).filter(Boolean) ??
      [paragraph]

    let current = ''
    for (const sentence of sentences) {
      if (current && current.length + sentence.length + 1 > MAX_BLOCK_LENGTH) {
        blocks.push(current.trim())
        current = sentence
      } else {
        current = current ? `${current} ${sentence}` : sentence
      }
    }
    if (current.trim()) blocks.push(current.trim())
  }

  return blocks.map(stripTrailingPeriod)
}

/**
 * Envia a resposta da IA em blocos separados, simulando uma conversa natural
 * no WhatsApp: envia um bloco, aguarda um tempo aleatório entre 2 e 3 segundos
 * e então envia o próximo, até terminar todos os blocos.
 */
/**
 * @param shouldStop consultado antes de CADA bloco. Se devolver true, o envio
 * para ali e a função retorna quantos blocos saíram. Existe para o botão
 * "Atendimento humano" surtir efeito no meio de uma resposta longa: uma resposta
 * de 8 blocos leva ~40s para sair, e sem isso a IA "continuava falando" depois
 * de pausada. Sem o parâmetro, o comportamento é o de sempre.
 */
export async function sendSplitText(
  phone: string,
  text: string,
  shouldStop?: () => Promise<boolean>
): Promise<{ sent: number; total: number; failed: boolean }> {
  const blocks = splitIntoBlocks(text)
  if (blocks.length === 0) return { sent: 0, total: 0, failed: false }

  for (let i = 0; i < blocks.length; i++) {
    if (shouldStop && (await shouldStop())) {
      console.log(`[UAZAPI] envio interrompido antes do bloco ${i + 1}/${blocks.length} — ${phone}`)
      return { sent: i, total: blocks.length, failed: false }
    }
    try {
      await sendText(phone, blocks[i])
    } catch (e) {
      // Uazapi 5xx/timeout no meio: devolvemos o que chegou em vez de lançar,
      // para o histórico refletir só o que o lead recebeu de fato.
      console.error(`[UAZAPI] envio falhou no bloco ${i + 1}/${blocks.length} — ${phone}:`, e instanceof Error ? e.message : e)
      return { sent: i, total: blocks.length, failed: true }
    }

    // Entre um bloco e o próximo, espera aleatória de 2 a 3 segundos.
    if (i < blocks.length - 1) {
      await sleep(getRandomBlockDelay())
    }
  }
  return { sent: blocks.length, total: blocks.length, failed: false }
}

export async function findChats(offset = 0, limit = 100) {
  const r = await request('/chat/find', { offset, limit, sort: '-wa_lastMsgTimestamp' })
  const chats = Array.isArray(r?.chats) ? r.chats : []
  return { chats, hasMore: chats.length === limit }
}

export async function findMessages(chatid: string, offset = 0, limit = 200) {
  const r = await request('/message/find', { chatid, offset, limit })
  return { messages: Array.isArray(r?.messages) ? r.messages : [], hasMore: Boolean(r?.hasMore), nextOffset: Number(r?.nextOffset ?? offset + limit) }
}

export async function downloadMedia(fullId: string, timeoutMs = 20000): Promise<{ fileURL: string; mimetype: string } | null> {
  try {
    const r = await request('/message/download', { id: fullId }, timeoutMs)
    return r?.fileURL ? { fileURL: r.fileURL, mimetype: r.mimetype ?? '' } : null
  } catch (e) { console.error('[UAZAPI] download falhou', fullId, e); return null }
}

export async function sendMedia(number: string, type: 'image' | 'video' | 'audio' | 'document', file: string, caption?: string, docName?: string, opts?: { ptt?: boolean }) {
  // Mesmo marcador do sendText: sem ele o webhook da Carol lê o eco do próprio
  // envio como mensagem humana e sobrescreve o human_lock de 30 dias por 15 min.
  // ponytail: Redis fora do ar não pode travar o envio — logamos e seguimos.
  try {
    await getRedis().multi().sadd(botSendingKey(number), caption?.trim() || '[media]').expire(botSendingKey(number), 90).exec()
  } catch (e) { console.error('[UAZAPI] bot:sending falhou', number, e) }

  return request('/send/media', { number, type, file, text: caption ?? '', docName, ...opts })
}

export async function markRead(number: string) {
  try { await request('/chat/read', { number }) } catch (e) { console.error('[UAZAPI] chat/read falhou', number, e) }
}

export async function notifyQualifiedLead(leadPhone: string, summary: string, guidance: string, personaName = 'Carol') {
  const adminPhone = process.env.ADMIN_PHONE
  if (!adminPhone) return
  const text =
    `✅ NOVO LEAD QUALIFICADO\n\n` +
    `o lead: ${leadPhone} foi qualificado pela agente de IA ${personaName}\n\n` +
    `resumo: ${summary}\n\n` +
    `orientações: ${guidance}\n\n` +
    `--------------------------------------------------`
  await sendText(adminPhone, text)
}

/**
 * Revoga a mensagem no WhatsApp ("apagar para todos"). Aceita tanto o messageid
 * curto (3EB0...) quanto o id completo OWNER:MSGID — ambos verificados na instância.
 * Erro sobe com status e corpo cru da Uazapi (ver helper request).
 */
export async function deleteMessage(id: string) {
  // Com teto: sem ele, instância pendurada deixa o botão da lixeira em '…' para
  // sempre no CRM. Estourando, o erro sobe e a rota devolve 502.
  return request('/message/delete', { id }, 15000)
}
