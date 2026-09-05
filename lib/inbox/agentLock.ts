import { getRedis } from '@/lib/redis/client'
import { humanLockKey } from '@/lib/agent/keys'

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
