/**
 * Limpa a resposta da IA antes de gravar e enviar. O agente remove só o primeiro
 * "[HANDOFF]" em maiúsculas; qualquer variação restante ("[handoff]", "[ HANDOFF ]",
 * uma segunda ocorrência) vazaria para o lead.
 */
export function sanitizeReply(reply: string): string {
  return reply
    .replace(/\[\s*handoff\s*\]/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
