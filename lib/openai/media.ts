import OpenAI from 'openai'
import { parseMessage, type WaMessageInput } from '@/lib/uazapi/parse'
import { downloadMedia } from '@/lib/uazapi/client'

// Prefixos que marcam, no histórico da conversa, que aquele texto não foi
// digitado pelo lead — veio de um áudio ou de uma imagem.
export const AUDIO_TEXT_PREFIX = '[audio transcrito]'
export const IMAGE_TEXT_PREFIX = '[imagem recebida]'

const MODEL = process.env.OPENAI_MODEL ?? 'gpt-4.1'

// Orçamento TOTAL desta etapa, não teto por chamada. A cliente exige resposta em
// até 10s e a conversão roda antes da janela de agrupamento, então o pior caso
// aqui é o que decide se o ciclo estoura: com um teto por chamada, download +
// fetch + whisper somavam 60s. O deadline é compartilhado — cada chamada recebe
// o que sobrou — e estourando o webhook volta ao comportamento antigo (ignora a
// mídia) em vez de travar o atendimento.
// ponytail: 8s cobre áudio de WhatsApp curto (o comum em qualificação); áudio
// longo perde a transcrição. Subir junto com AGENT_DEBOUNCE_MS se o alvo mudar.
const MEDIA_BUDGET_MS = 8000

/** Milissegundos restantes do orçamento, com piso de 1s para não abortar na hora. */
function remaining(deadline: number): number {
  return Math.max(1000, deadline - Date.now())
}

const VISION_PROMPT =
  'Descreva esta imagem de forma factual em português, em 1 a 3 frases. Se houver texto legível na imagem, transcreva o texto. Não interprete intenções nem invente informação.'

export interface MediaDeps {
  downloadMedia: (fullId: string, timeoutMs?: number) => Promise<{ fileURL: string; mimetype: string } | null>
  transcribe: (file: File, deadline: number) => Promise<string>
  describe: (imageUrl: string, deadline: number) => Promise<string>
  fetch: typeof globalThis.fetch
}

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
}

const defaultDeps: MediaDeps = {
  downloadMedia,
  transcribe: async (file, deadline) => {
    const r = await getOpenAI().audio.transcriptions.create(
      { file, model: 'whisper-1', language: 'pt' },
      { signal: AbortSignal.timeout(remaining(deadline)) }
    )
    return r.text
  },
  describe: async (imageUrl, deadline) => {
    const c = await getOpenAI().chat.completions.create(
      {
        model: MODEL,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: VISION_PROMPT },
              { type: 'image_url', image_url: { url: imageUrl } },
            ],
          },
        ],
      },
      { signal: AbortSignal.timeout(remaining(deadline)) }
    )
    return c.choices[0]?.message?.content ?? ''
  },
  fetch: (...args) => globalThis.fetch(...args),
}

// O webhook do agente não tem segredo: uma fileURL forjada no payload faria a
// VPS buscar qualquer endereço (inclusive rede interna). Só aceitamos URL do
// próprio host da Uazapi; qualquer outra coisa passa pelo downloadMedia oficial.
export function isTrustedMediaUrl(url: string, base = process.env.UAZAPI_BASE_URL ?? ''): boolean {
  try {
    const u = new URL(url)
    const b = new URL(base)
    return u.protocol === 'https:' && u.host === b.host
  } catch {
    return false
  }
}

async function mediaUrl(m: WaMessageInput, deps: MediaDeps, deadline: number): Promise<string | null> {
  if (m.media_url && isTrustedMediaUrl(m.media_url)) return m.media_url
  if (m.media_url) console.warn('[WEBHOOK] fileURL fora do host da Uazapi ignorada:', m.media_url.slice(0, 80))
  if (!m.wa_full_id) return null
  return (await deps.downloadMedia(m.wa_full_id, remaining(deadline)))?.fileURL ?? null
}

// Whisper decide o decoder pela extensão: 'audio.ogg' para um mp4/webm dá erro de formato.
export function audioFileName(mime: string | null | undefined): string {
  const m = (mime ?? '').toLowerCase()
  if (m.includes('mp4') || m.includes('m4a') || m.includes('aac')) return 'audio.m4a'
  if (m.includes('mpeg') || m.includes('mp3')) return 'audio.mp3'
  if (m.includes('webm')) return 'audio.webm'
  if (m.includes('wav')) return 'audio.wav'
  return 'audio.ogg'
}

/**
 * Converte áudio/imagem do lead em texto para o agente entender.
 * Nunca lança: qualquer falha (download, transcrição, visão) vira log e null,
 * que é o comportamento antigo do webhook (encerra sem responder).
 */
export async function resolveMediaText(
  raw: Record<string, unknown>,
  deps: Partial<MediaDeps> = {}
): Promise<string | null> {
  const d = { ...defaultDeps, ...deps }
  const m = parseMessage(raw)
  if (!m) return null

  // Mídia com legenda (ou mensagem de texto): o texto do lead já basta, não
  // gastamos chamada de OpenAI.
  if (m.text) return m.text
  if (m.type === 'text') return null

  if (m.type === 'video') {
    console.log('[WEBHOOK] video ignorado - fora de escopo')
    return null
  }
  if (m.type !== 'audio' && m.type !== 'image') {
    console.log(`[WEBHOOK] midia ignorada - fora de escopo: ${m.type}`)
    return null
  }

  const startedAt = Date.now()
  const deadline = startedAt + MEDIA_BUDGET_MS
  try {
    const url = await mediaUrl(m, d, deadline)
    if (!url) {
      console.log(`[WEBHOOK] ${m.type} sem URL de midia - ignorado`)
      return null
    }

    let text: string
    if (m.type === 'audio') {
      // Sem sinal, um host de mídia que trava sem fechar a conexão deixa o
      // webhook pendurado para sempre e a Uazapi reentrega o evento.
      const res = await d.fetch(url, { signal: AbortSignal.timeout(remaining(deadline)) })
      if (!res.ok) throw new Error(`download do audio retornou ${res.status}`)
      const blob = await res.blob()
      const file = new File([blob], audioFileName(m.media_mime || blob.type), { type: m.media_mime || blob.type || 'audio/ogg' })
      text = (await d.transcribe(file, deadline)).trim()
    } else {
      text = (await d.describe(url, deadline)).trim()
    }

    console.log(`[WEBHOOK] midia ${m.type} convertida em texto em ${Date.now() - startedAt}ms`)
    if (!text) return null
    return `${m.type === 'audio' ? AUDIO_TEXT_PREFIX : IMAGE_TEXT_PREFIX} ${text}`
  } catch (e) {
    console.error(`[WEBHOOK] falha ao converter midia ${m.type} em texto apos ${Date.now() - startedAt}ms`, e)
    return null
  }
}
