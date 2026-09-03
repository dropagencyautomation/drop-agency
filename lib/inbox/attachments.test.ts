import { describe, it, expect } from 'vitest'
import { validateAttachment, MAX_ATTACHMENT_BYTES, DROP_ACCEPT } from './attachments'

const rules = { maxBytes: MAX_ATTACHMENT_BYTES, accept: DROP_ACCEPT }

describe('validateAttachment', () => {
  it('aceita imagem dentro do limite', () => {
    expect(validateAttachment({ type: 'image/png', size: 1024 }, rules)).toEqual({ ok: true })
  })
  it('recusa tipo fora do accept', () => {
    const r = validateAttachment({ type: 'application/pdf', size: 1024 }, rules)
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.error).toContain('application/pdf')
  })
  it('recusa arquivo acima do limite dizendo o limite', () => {
    const r = validateAttachment({ type: 'video/mp4', size: MAX_ATTACHMENT_BYTES + 1 }, rules)
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.error).toContain('16 MB')
  })
  it('recusa entrada vazia', () => {
    expect(validateAttachment(null, rules).ok).toBe(false)
    expect(validateAttachment(undefined, rules).ok).toBe(false)
  })
})
