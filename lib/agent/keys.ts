import { phoneKey } from '@/lib/inbox/whitelist'

// Chaves do Redis SEMPRE pela chave canônica do telefone.
// O CRM conhece o número na forma gravada em wa_chats.id e o webhook na forma
// que o WhatsApp entrega — as duas divergem quando o assinante tem as variantes
// com e sem o nono dígito. Sem normalizar, pausar o agente pelo CRM gravava numa
// chave e o webhook lia outra: a pausa não pegava.
const key = (prefix: string, phone: string) => `${prefix}:${phoneKey(phone) ?? phone}`

/** Atendimento humano: enquanto existe, a IA não responde. */
export const humanLockKey = (phone: string) => key('human_lock', phone)

/** Marca que o próprio bot está enviando, para o webhook não ler o eco como humano. */
export const botSendingKey = (phone: string) => key('bot:sending', phone)

/** Marcador de agrupamento: só a invocação da mensagem mais nova responde. */
export const latestMsgKey = (phone: string) => key('latest_msg', phone)
