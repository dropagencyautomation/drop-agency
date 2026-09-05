// Sem acento e sem caixa: "Jhéssica" e "jhessica" são o mesmo nome.
const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

// Partículas de nome composto ("Maria da Silva") que aparecem em qualquer frase:
// não podem servir de prova de que o lead disse o nome.
const PARTICLES = new Set(['da', 'de', 'do', 'das', 'dos', 'e'])

/**
 * O nome extraído pela IA só vale se o LEAD o escreveu. Incidente: a atendente
 * digitou "Paula" numa mensagem manual (que chega ao modelo como assistant) e o
 * extrator passou a chamar a lead de Paula. Basta QUALQUER token do nome com
 * >= 2 letras (fora partículas) aparecer como palavra em algum texto inbound —
 * "J. Carlos" e "Sr. Roberto" valem pelo "carlos"/"roberto".
 */
export function leadSaidName(name: string | undefined, inboundTexts: string[]): boolean {
  const tokens = fold(name ?? '')
    .split(/[^\p{L}]+/u)
    .filter((t) => t.length >= 2 && !PARTICLES.has(t))
  if (!tokens.length) return false
  return inboundTexts.some((t) => {
    const words = fold(t).split(/[^\p{L}]+/u)
    return tokens.some((tok) => words.includes(tok))
  })
}
