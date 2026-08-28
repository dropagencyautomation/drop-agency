import { getRedis } from '@/lib/redis/client'

const BASE_URL = process.env.UAZAPI_BASE_URL!
const TOKEN = process.env.UAZAPI_TOKEN!
const INSTANCE = process.env.UAZAPI_INSTANCE!

async function request(path: string, body?: object) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
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
  await getRedis().set(`bot:sending:${phone}`, '1', 'EX', 15)

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
