import { phoneKey } from '@/lib/inbox/whitelist'

/**
 * Todas as formas em que o MESMO assinante pode estar gravado, só dígitos:
 * com/sem 55, com/sem o nono dígito, a forma real recebida. Serve para achar um
 * lead criado no CRM ("(11) 99341-4181") quando ele escreve no WhatsApp
 * ("5511993414181@s.whatsapp.net") em vez de criar um segundo lead.
 *
 * ponytail: só Brasil. Para número internacional devolve só os dígitos como vieram.
 */
export function phoneVariants(input: string | null | undefined): string[] {
  if (!input) return []
  const raw = String(input).replace(/@.*$/, '').split(':')[0].replace(/\D/g, '')
  if (!raw) return []
  const out = new Set<string>([raw])

  // Formulário sem DDI: DDD + celular (11 dígitos, 9 na frente) ou DDD + fixo
  // (10 dígitos, 2-5 na frente). Um "1 202 555 0123" americano tem 11 dígitos
  // mas o terceiro não é 9 — fica como está.
  const looksBrLocal = /^\d{2}9\d{8}$/.test(raw) || /^\d{2}[2-5]\d{7}$/.test(raw)
  const withDdi = looksBrLocal ? `55${raw}` : raw
  out.add(withDdi)

  const key = phoneKey(withDdi.length === 12 || withDdi.length === 13 ? `${withDdi}@s.whatsapp.net` : withDdi)
  if (key && key.startsWith('55') && key.length === 12) {
    const ddd = key.slice(2, 4)
    const local8 = key.slice(4)
    out.add(key)                        // 55 + DDD + 8 dígitos
    out.add(`55${ddd}9${local8}`)       // 55 + DDD + 9 + 8 dígitos
    out.add(`${ddd}${local8}`)          // sem DDI
    out.add(`${ddd}9${local8}`)
  }
  return [...out]
}
