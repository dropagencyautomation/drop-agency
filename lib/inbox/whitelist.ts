// Espelho da whitelist de app/api/webhook/whatsapp/route.ts (ALLOWED_CHATIDS).
// Manter as duas listas iguais ao liberar um número novo.
export const INBOX_ALLOWED_CHATIDS = new Set([
  '5511994800080@s.whatsapp.net',
  '554187490574@s.whatsapp.net',
  '5511989869931@s.whatsapp.net',
  '5511993414181@s.whatsapp.net',
  '5511964868132@s.whatsapp.net',
  '5541996621204@s.whatsapp.net',
  '5511996008567@s.whatsapp.net',
  '5543999301514@s.whatsapp.net',
  '5543988376610@s.whatsapp.net',
])

export const isAllowedChat = (chatId: string) => INBOX_ALLOWED_CHATIDS.has(chatId)
