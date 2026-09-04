import { getRedis } from '@/lib/redis/client'
import { humanLockKey } from '@/lib/agent/keys'

// Pausa manual (botão "Atendimento humano" no CRM): vale até alguém devolver a
// conversa para a IA. O TTL de 30 dias é só uma rede de segurança para a chave
// não viver para sempre se ninguém religar.
const MANUAL_PAUSE_SECONDS = 30 * 24 * 3600

const DEFAULT_AUTO_LOCK_MINUTES = 60
const MIN_AUTO_LOCK_MINUTES = 1
const MAX_AUTO_LOCK_MINUTES = 24 * 60

/**
 * Janela de silêncio da IA quando alguém responde o lead pelo celular, sem usar
 * o CRM. Curta demais e a IA volta a falar no meio do atendimento humano.
 */
export function resolveAutoLockSeconds(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return DEFAULT_AUTO_LOCK_MINUTES * 60
  const value = Number(raw)
  if (!Number.isInteger(value) || value < MIN_AUTO_LOCK_MINUTES || value > MAX_AUTO_LOCK_MINUTES) {
    console.log(
      `[WEBHOOK] AGENT_HUMAN_LOCK_MINUTES invalido: "${raw}" — usando ${DEFAULT_AUTO_LOCK_MINUTES} min`
    )
    return DEFAULT_AUTO_LOCK_MINUTES * 60
  }
  return value * 60
}

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
export async function touchHumanLock(phone: string) {
  try {
    const redis = getRedis()
    const k = humanLockKey(phone)
    const ttl = await redis.ttl(k) // -2: não existe | -1: existe sem expiração
    const autoSeconds = resolveAutoLockSeconds(process.env.AGENT_HUMAN_LOCK_MINUTES)
    if (ttl === -1 || ttl >= autoSeconds) return // pausa mais longa já vale: preserva
    await redis.set(k, '1', 'EX', autoSeconds)
  } catch (e) {
    console.error('[INBOX] touchHumanLock', e)
  }
}
