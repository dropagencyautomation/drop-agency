import { describe, it, expect } from 'vitest'
import { previewFor } from './store'

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
