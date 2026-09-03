// Janela de agrupamento das mensagens do lead antes de a IA responder.
// Curta = resposta rápida, porém mais risco de responder antes de o lead
// terminar de digitar. Longa = respostas mais coesas, porém ciclo lento.
const DEFAULT_DEBOUNCE_MS = 6000
const MIN_DEBOUNCE_MS = 500
const MAX_DEBOUNCE_MS = 30000

// Janela usada quando a mensagem do lead veio de áudio/imagem: a transcrição já
// gastou segundos do orçamento e mídia não chega em rajada como texto digitado.
export const MEDIA_DEBOUNCE_MS = 1500

export function resolveDebounceMs(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return DEFAULT_DEBOUNCE_MS

  const value = Number(raw)
  if (!Number.isInteger(value)) {
    console.log(`[WEBHOOK] AGENT_DEBOUNCE_MS invalido (nao e inteiro): "${raw}" — usando ${DEFAULT_DEBOUNCE_MS}ms`)
    return DEFAULT_DEBOUNCE_MS
  }
  if (value < MIN_DEBOUNCE_MS || value > MAX_DEBOUNCE_MS) {
    console.log(`[WEBHOOK] AGENT_DEBOUNCE_MS fora da faixa ${MIN_DEBOUNCE_MS}..${MAX_DEBOUNCE_MS}: "${raw}" — usando ${DEFAULT_DEBOUNCE_MS}ms`)
    return DEFAULT_DEBOUNCE_MS
  }
  return value
}

// O marcador latest_msg precisa sobreviver não só à janela de agrupamento, mas
// também ao processamento que vem depois dela (chamada da OpenAI + envio em
// blocos). Se o marcador expirar no meio, a comparação com o arrivalTs falha e
// uma mensagem seguinte do lead ficaria sem resposta. Piso de 30s cobre o pior
// caso de processamento mesmo com janelas curtas.
export function latestMsgTtlSeconds(debounceMs: number): number {
  return Math.max(30, Math.ceil(debounceMs / 1000) * 3)
}
