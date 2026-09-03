// Fonte única da whitelist de números atendidos pela Carol e espelhados no inbox.
// Guardamos as chaves CRUAS (só dígitos); a comparação é sempre por chave normalizada,
// nunca por igualdade de string do JID — ver phoneKey() abaixo.
//
// Contexto (investigação de 2026-09-03): a Uazapi entrega o mesmo assinante ora com o
// nono dígito, ora sem ele, e a forma canônica é decidida pelo WhatsApp por assinante
// (não por DDD). Três números liberados aqui estavam cadastrados com 13 dígitos enquanto
// o WhatsApp entregava 12, e toda mensagem de entrada deles era descartada em silêncio.
const RAW_ALLOWED = [
  '5511994800080',
  '554187490574',
  '5511989869931',
  '5511993414181',
  '5511964868132',
  '5541996621204',
  '5511996008567',
  '5543999301514',
  '5543988376610',
]

/**
 * Chave canônica de um identificador de chat, para comparação e chaveamento
 * (whitelist, leads, ai_conversations, locks do Redis).
 *
 * Devolve `null` para tudo que NÃO é telefone: `@lid` (LinkedID — identidade do
 * WhatsApp que não se converte em número), `@g.us` (grupo), `@broadcast`,
 * `@newsletter` e qualquer coisa malformada. Um LID nunca vira telefone.
 *
 * Para telefone brasileiro colapsa as duas formas (com e sem o nono dígito) na
 * mesma chave: 5541996621204 e 554196621204 → 554196621204.
 *
 * ponytail: assume Brasil (55 + DDD de 2 dígitos). Números de outros países passam
 * pelos dígitos sem normalização; trocar por libphonenumber se a operação passar a
 * atender fora do BR de verdade.
 */
export function phoneKey(input: string | null | undefined): string | null {
  if (typeof input !== 'string') return null
  const raw = input.trim()
  if (!raw) return null

  const at = raw.indexOf('@')
  if (at >= 0) {
    const suffix = raw.slice(at + 1).toLowerCase()
    if (suffix !== 's.whatsapp.net' && suffix !== 'c.us') return null
  }

  // O WhatsApp anexa o dispositivo depois de ":" (ex.: 265772626636828:92@lid).
  const local = (at >= 0 ? raw.slice(0, at) : raw).split(':')[0]
  if (!/^\d+$/.test(local)) return null

  // Sem sufixo só aceitamos o que é reconhecível como telefone brasileiro; caso
  // contrário um LID cru (14-15 dígitos) seria confundido com número.
  if (at < 0 && !/^55\d{10,11}$/.test(local)) return null

  const br = /^55(\d{2})(\d{8,9})$/.exec(local)
  return br ? `55${br[1]}${br[2].slice(-8)}` : local
}

/**
 * Telefone REAL de um identificador, sem normalizar o nono dígito: é a forma que o
 * WhatsApp usa para este assinante e a única segura para enviar mensagem, chavear
 * lead/conversa e montar as chaves do Redis.
 *
 * Devolve `null` nos mesmos casos de phoneKey (@lid, @g.us, malformado). Use
 * phoneKey só para COMPARAR; use este para IDENTIFICAR.
 */
export function phoneFromJid(input: string | null | undefined): string | null {
  if (typeof input !== 'string') return null
  const raw = input.trim()
  if (!raw) return null

  const at = raw.indexOf('@')
  if (at >= 0) {
    const suffix = raw.slice(at + 1).toLowerCase()
    if (suffix !== 's.whatsapp.net' && suffix !== 'c.us') return null
  }

  const local = (at >= 0 ? raw.slice(0, at) : raw).split(':')[0]
  if (!/^\d+$/.test(local)) return null
  if (at < 0 && !/^55\d{10,11}$/.test(local)) return null

  return local
}

const ALLOWED_KEYS = new Set(RAW_ALLOWED.map(phoneKey).filter((k): k is string => k !== null))

/** true quando o identificador corresponde a um número liberado, em qualquer das formas. */
export function isAllowedChat(chatId: string | null | undefined): boolean {
  const key = phoneKey(chatId)
  return key !== null && ALLOWED_KEYS.has(key)
}
