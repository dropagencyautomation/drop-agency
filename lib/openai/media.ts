import OpenAI from 'openai'
import { parseMessage, type WaMessageInput } from '@/lib/uazapi/parse'
import { downloadMedia } from '@/lib/uazapi/client'

// Prefixos que marcam, no histórico da conversa, que aquele texto não foi
// digitado pelo lead — veio de um áudio ou de uma imagem.
export const AUDIO_TEXT_PREFIX = '[audio transcrito]'
export const IMAGE_TEXT_PREFIX = '[imagem recebida]'

const MODEL = process.env.OPENAI_MODEL ?? 'gpt-4.1'

// Tetos desta etapa. Estourando, o webhook volta ao comportamento antigo
// (ignora a mídia) em vez de travar o atendimento.
// Visão: imagem é uma chamada rápida, 6s basta.
const VISION_TIMEOUT_MS = 6000
// Áudio: 6s derrubava áudio de WhatsApp de 45-90s (upload + whisper), deixando
// o lead sem resposta nenhuma. 20s é a mesma ordem já aceita no downloadMedia.
// Vale para o download do arquivo e para o whisper, cada um por si.
const AUDIO_TIMEOUT_MS = 20000

const VISION_PROMPT =
  'Descreva esta imagem de forma factual em português, em 1 a 3 frases. Se houver texto legível na imagem, transcreva o texto. Não interprete intenções nem invente informação.'

export interface MediaDeps {
  downloadMedia: (fullId: string) => Promise<{ fileURL: string; mimetype: string } | null>
  transcribe: (file: File) => Promise<string>
  describe: (imageUrl: string) => Promise<string>
  fetch: typeof globalThis.fetch
}

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
}

const defaultDeps: MediaDeps = {
  downloadMedia,
  transcribe: async (file) => {
    const r = await getOpenAI().audio.transcriptions.create(
      { file, model: 'whisper-1', language: 'pt' },
      { signal: AbortSignal.timeout(AUDIO_TIMEOUT_MS) }
    )
    return r.text
  },
  describe: async (imageUrl) => {
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
      { signal: AbortSignal.timeout(VISION_TIMEOUT_MS) }
    )
    return c.choices[0]?.message?.content ?? ''
  },
  fetch: (...args) => globalThis.fetch(...args),
}

async function mediaUrl(m: WaMessageInput, deps: MediaDeps): Promise<string | null> {
  if (m.media_url) return m.media_url
  if (!m.wa_full_id) return null
  return (await deps.downloadMedia(m.wa_full_id))?.fileURL ?? null
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
  try {
    const url = await mediaUrl(m, d)
    if (!url) {
      console.log(`[WEBHOOK] ${m.type} sem URL de midia - ignorado`)
      return null
    }

    let text: string
    if (m.type === 'audio') {
      // Sem sinal, um host de mídia que trava sem fechar a conexão deixa o
      // webhook pendurado para sempre e a Uazapi reentrega o evento.
      const res = await d.fetch(url, { signal: AbortSignal.timeout(AUDIO_TIMEOUT_MS) })
      if (!res.ok) throw new Error(`download do audio retornou ${res.status}`)
      const blob = await res.blob()
      const file = new File([blob], 'audio.ogg', { type: m.media_mime || blob.type || 'audio/ogg' })
      text = (await d.transcribe(file)).trim()
    } else {
      text = (await d.describe(url)).trim()
    }

    console.log(`[WEBHOOK] midia ${m.type} convertida em texto em ${Date.now() - startedAt}ms`)
    if (!text) return null
    return `${m.type === 'audio' ? AUDIO_TEXT_PREFIX : IMAGE_TEXT_PREFIX} ${text}`
  } catch (e) {
    console.error(`[WEBHOOK] falha ao converter midia ${m.type} em texto apos ${Date.now() - startedAt}ms`, e)
    return null
  }
}
