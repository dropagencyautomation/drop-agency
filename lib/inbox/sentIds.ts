/**
 * Extrai os ids da resposta de envio da Uazapi.
 * Formatos vistos: { id: 'OWNER:MSGID' } ou { messageid: 'MSGID' } — às vezes os dois.
 * Sem nenhum dos dois devolvemos null: quem chama não deve inventar id.
 */
export function extractSentIds(res: unknown): { fullId: string | null; waMessageId: string | null } {
  const r = (res ?? {}) as { id?: unknown; messageid?: unknown }
  const fullId = String(r.id ?? '') || null
  const short = String(r.messageid ?? '') || (fullId ? fullId.replace(/^.*:/, '') : '')
  return { fullId, waMessageId: short || null }
}
