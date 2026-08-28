import { describe, it, expect } from 'vitest'
import { previewFor, updateStatus } from './store'
import type { WaStatus } from '@/types/database'

describe('previewFor', () => {
  it('texto vira preview cortado', () => {
    expect(previewFor({ type: 'text', text: 'a'.repeat(120) } as never)).toHaveLength(80)
  })
  it('mídia vira rótulo', () => {
    expect(previewFor({ type: 'image', text: null } as never)).toBe('📷 Foto')
    expect(previewFor({ type: 'image', text: 'legenda' } as never)).toBe('📷 legenda')
    expect(previewFor({ type: 'audio', text: null } as never)).toBe('🎤 Áudio')
    expect(previewFor({ type: 'document', text: null, media_name: 'x.pdf' } as never)).toBe('📄 x.pdf')
  })
})

// db falso mínimo: só o que updateStatus encadeia (select→eq→maybeSingle, update→eq).
function fakeDb(current: WaStatus | null) {
  const updates: WaStatus[] = []
  const db = {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: current ? { status: current } : null }) }) }),
      update: (patch: { status: WaStatus }) => ({ eq: async () => { updates.push(patch.status); return {} } }),
    }),
  }
  return { db, updates }
}

describe('updateStatus', () => {
  it('não rebaixa read para delivered', async () => {
    const { db, updates } = fakeDb('read')
    await updateStatus(db as never, 'M1', 'delivered')
    expect(updates).toEqual([])
  })
  it('não reescreve o mesmo status', async () => {
    const { db, updates } = fakeDb('sent')
    await updateStatus(db as never, 'M1', 'sent')
    expect(updates).toEqual([])
  })
  it('promove sent para read', async () => {
    const { db, updates } = fakeDb('sent')
    await updateStatus(db as never, 'M1', 'read')
    expect(updates).toEqual(['read'])
  })
  it('mensagem inexistente não é atualizada', async () => {
    const { db, updates } = fakeDb(null)
    await updateStatus(db as never, 'M1', 'read')
    expect(updates).toEqual([])
  })
})
