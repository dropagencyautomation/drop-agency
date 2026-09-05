import { describe, it, expect } from 'vitest'
import { sanitizeReply } from './reply'

describe('sanitizeReply', () => {
  it('remove variações da tag de handoff', () => {
    expect(sanitizeReply('[handoff] Vou levar para o time.')).toBe('Vou levar para o time.')
    expect(sanitizeReply('Claro.\n\n[ HANDOFF ]\n\nAté já.')).toBe('Claro.\n\nAté já.')
    expect(sanitizeReply('[HANDOFF][HANDOFF] oi')).toBe('oi')
  })
  it('colapsa linhas em branco excessivas e apara', () => {
    expect(sanitizeReply('  a\n\n\n\nb  ')).toBe('a\n\nb')
  })
  it('resposta só com a tag vira vazia', () => {
    expect(sanitizeReply('[HANDOFF]')).toBe('')
  })
})
