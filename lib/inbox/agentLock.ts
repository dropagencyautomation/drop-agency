import { getRedis } from '@/lib/redis/client'
const KEY = (phone: string) => `human_lock:${phone}` // mesma chave que o webhook da Carol já respeita
const MONTH = 30 * 24 * 3600

export async function pauseAgent(phone: string) { try { await getRedis().set(KEY(phone), '1', 'EX', MONTH) } catch (e) { console.error('[INBOX] pauseAgent', e) } }
export async function resumeAgent(phone: string) { try { await getRedis().del(KEY(phone)) } catch (e) { console.error('[INBOX] resumeAgent', e) } }
export async function isAgentPaused(phone: string) { try { return (await getRedis().exists(KEY(phone))) === 1 } catch { return false } }
