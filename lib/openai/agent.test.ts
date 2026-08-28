import { describe, it, expect } from 'vitest'
import { buildSystemPrompt } from './agent'
import { DEFAULT_SETTINGS } from '@/lib/agent/defaults'

const prod = { id: '1', name: 'Site institucional', description: 'Site de até 5 páginas', price: 'R$ 4.000', photo_url: null, is_active: true, sort_order: 0, created_at: '', updated_at: '' }

describe('buildSystemPrompt', () => {
  it('defaults sem produtos = prompt original', () => {
    const p = buildSystemPrompt(DEFAULT_SETTINGS, [])
    for (const h of ['REGRA ABSOLUTA E INEGOCIÁVEL', 'IDENTIDADE', 'ARQUÉTIPO', 'SOBRE A DROP AGENCY', 'PERFIL IDEAL DE CLIENTE', 'O QUE VOCÊ NUNCA PODE REVELAR', 'COMO VOCÊ DEVE SE COMUNICAR', 'FLUXO DE QUALIFICAÇÃO', 'ROTEAMENTO COMERCIAL', 'GATILHOS DE ESCALADA', 'O QUE VOCÊ NUNCA DEVE FAZER']) {
      expect(p).toContain(h)
    }
    expect(p).toContain('Seu nome é Carol')
    expect(p).not.toContain('CATÁLOGO')
    expect(p).not.toContain('INFORMAÇÕES ADICIONAIS')
  })
  it('injeta nome, horário e informações adicionais', () => {
    const p = buildSystemPrompt({ ...DEFAULT_SETTINGS, persona_name: 'Bia', extra_info: 'Estacionamento próprio.', business_hours: { start: 9, end: 18 } }, [])
    expect(p).toContain('Seu nome é Bia')
    expect(p).toContain('Apresente-se como Bia')
    expect(p).not.toContain('Carol')
    expect(p).toContain('9h às 18h')
    expect(p).toContain('INFORMAÇÕES ADICIONAIS')
    expect(p).toContain('Estacionamento próprio.')
  })
  it('catálogo sem preço quando reveal_prices=false', () => {
    const p = buildSystemPrompt(DEFAULT_SETTINGS, [prod])
    expect(p).toContain('CATÁLOGO')
    expect(p).toContain('Site institucional')
    expect(p).not.toContain('R$ 4.000')
  })
  it('catálogo com preço quando reveal_prices=true', () => {
    const p = buildSystemPrompt({ ...DEFAULT_SETTINGS, reveal_prices: true }, [prod])
    expect(p).toContain('R$ 4.000')
    expect(p).toContain('pode informar os valores do catálogo')
  })
})
