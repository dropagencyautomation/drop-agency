import { describe, it, expect } from 'vitest'
import { resolveSettings, loadAgentConfig } from './settings'
import { DEFAULT_SETTINGS } from './defaults'

describe('resolveSettings', () => {
  it('null → defaults', () => {
    expect(resolveSettings(null)).toEqual(DEFAULT_SETTINGS)
  })
  it('campo preenchido vence, persona vazio vira Carol', () => {
    const s = resolveSettings({ persona_name: '  ', extra_info: 'Estacionamento próprio.' })
    expect(s.persona_name).toBe('Carol')
    expect(s.extra_info).toBe('Estacionamento próprio.')
  })
  it('business_hours inválido volta ao default', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(resolveSettings({ business_hours: { start: 'x' } as any }).business_hours).toEqual({ start: 8, end: 19 })
  })
  it('business_hours fora do intervalo volta ao default', () => {
    expect(resolveSettings({ business_hours: { start: -5, end: 25 } }).business_hours).toEqual({ start: 8, end: 19 })
  })
})

describe('loadAgentConfig', () => {
  it('erro no banco → defaults e lista vazia', async () => {
    const boom = async () => { throw new Error('down') }
    const fake = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: boom, order: boom }) }) }) }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await loadAgentConfig(fake as any)
    expect(r.settings).toEqual(DEFAULT_SETTINGS)
    expect(r.products).toEqual([])
  })

  it('supabase resolve com { data: null, error } (sem throw) → defaults e lista vazia', async () => {
    const err = { message: 'boom' }
    const fake = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: err }),
            order: async () => ({ data: null, error: err }),
          }),
        }),
      }),
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await loadAgentConfig(fake as any)
    expect(r.settings).toEqual(DEFAULT_SETTINGS)
    expect(r.products).toEqual([])
  })
})
