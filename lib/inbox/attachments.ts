// Limite espelhado de app/api/whatsapp/send/route.ts — o servidor recusa acima disso,
// então a UI não pode prometer mais do que ele aceita.
export const MAX_ATTACHMENT_BYTES = 16 * 1024 * 1024

// Arrastar/colar só aceita imagem e vídeo; o botão de clipe segue com a lista completa.
export const DROP_ACCEPT = ['image/', 'video/']

export interface AttachmentLike {
  type: string
  size: number
}

export interface AttachmentRules {
  maxBytes: number
  accept: string[]
}

export type AttachmentCheck = { ok: true } | { ok: false; error: string }

const mb = (bytes: number) => Math.round((bytes / (1024 * 1024)) * 10) / 10

export function validateAttachment(
  file: AttachmentLike | null | undefined,
  { maxBytes, accept }: AttachmentRules
): AttachmentCheck {
  if (!file) return { ok: false, error: 'Nenhum arquivo para anexar.' }
  if (!accept.some(p => file.type.startsWith(p))) {
    return { ok: false, error: `Tipo não aceito aqui${file.type ? ` (${file.type})` : ''}. Arraste ou cole apenas imagem ou vídeo — use o clipe para outros arquivos.` }
  }
  if (file.size > maxBytes) {
    return { ok: false, error: `Arquivo de ${mb(file.size)} MB acima do limite de ${mb(maxBytes)} MB.` }
  }
  return { ok: true }
}
