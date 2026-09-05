import { getRedis } from '@/lib/redis/client'
import { humanLockKey, botSendingKey } from '@/lib/agent/keys'

// Pausa manual (botão "Atendimento humano" no CRM): vale até alguém devolver a
// conversa para a IA. O TTL de 30 dias é só uma rede de segurança para a chave
// não viver para sempre se ninguém religar.
const MANUAL_PAUSE_SECONDS = 30 * 24 * 3600

// Janela usada quando o chamador não informa a configurada na tela Agente IA.
const FALLBACK_AUTO_LOCK_SECONDS = 72 * 60 * 60

export async function pauseAgent(phone: string) {
  try {
    await getRedis().set(humanLockKey(phone), 'manual', 'EX', MANUAL_PAUSE_SECONDS)
  } catch (e) {
    console.error('[INBOX] pauseAgent', e)
  }
}

export async function resumeAgent(phone: string) {
  try {
    await getRedis().del(humanLockKey(phone))
  } catch (e) {
    console.error('[INBOX] resumeAgent', e)
  }
}

export async function isAgentPaused(phone: string) {
  try {
    return (await getRedis().exists(humanLockKey(phone))) === 1
  } catch {
    return false
  }
}

/**
 * Renova o silêncio da IA porque um humano respondeu pelo celular.
 *
 * NUNCA encurta uma pausa existente: antes, esta renovação sobrescrevia a pausa
 * manual de 30 dias por uma janela de 15 minutos, e a IA voltava a responder
 * sozinha alguns minutos depois de a atendente clicar em "Atendimento humano".
 */
export async function touchHumanLock(phone: string, autoSeconds = FALLBACK_AUTO_LOCK_SECONDS) {
  try {
    const redis = getRedis()
    const k = humanLockKey(phone)
    const ttl = await redis.ttl(k) // -2: não existe | -1: existe sem expiração
    if (ttl === -1 || ttl >= autoSeconds) return // pausa mais longa já vale: preserva
    await redis.set(k, '1', 'EX', autoSeconds)
  } catch (e) {
    console.error('[INBOX] touchHumanLock', e)
  }
}

/** Compara ignorando espaços repetidos, caixa e pontuação final: a Uazapi devolve o texto como enviamos, mas não custa tolerar. */
const norm = (t: string) => t.replace(/\s+/g, ' ').replace(/[.!?…]+$/g, '').trim().toLowerCase()

/**
 * O eco de um envio do próprio bot é reconhecido pelo TEXTO, não só por "o bot
 * enviou algo nos últimos 15s": durante uma resposta longa (~1 min) a atendente
 * digitando pelo celular caía nessa janela e era engolida como eco — sem pausar
 * a IA e sem entrar no histórico. Mídia (texto vazio) ainda usa a janela.
 */
export async function isBotEcho(phone: string, text: string): Promise<boolean> {
  try {
    const redis = getRedis()
    const key = botSendingKey(phone)
    if (!text.trim()) return (await redis.exists(key)) === 1
    if ((await redis.sismember(key, text)) === 1) return true
    const sent = await redis.smembers(key)
    const hit = sent.some((s) => norm(s) === norm(text))
    if (!hit && sent.length > 0) {
      console.log('[WEBHOOK] fromMe durante envio do bot classificado como HUMANO (texto nao bate com nenhum bloco enviado)')
    }
    return hit
  } catch (e) {
    console.error('[INBOX] isBotEcho: redis indisponivel — tratando como humano', e)
    return false
  }
}
