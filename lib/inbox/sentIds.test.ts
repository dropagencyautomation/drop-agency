import { describe, it, expect } from 'vitest'
import { extractSentIds } from './sentIds'

describe('extractSentIds', () => {
  it('usa os dois campos quando ambos vêm', () => {
    expect(extractSentIds({ id: 'OWNER:ABC123', messageid: 'ABC123' })).toEqual({ fullId: 'OWNER:ABC123', waMessageId: 'ABC123' })
  })
  it('deriva o id curto quando só vem o id completo', () => {
    expect(extractSentIds({ id: 'OWNER:ABC123' })).toEqual({ fullId: 'OWNER:ABC123', waMessageId: 'ABC123' })
  })
  it('sem id nenhum devolve nulos', () => {
    expect(extractSentIds({ ok: true })).toEqual({ fullId: null, waMessageId: null })
  })
})
