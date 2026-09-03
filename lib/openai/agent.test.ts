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
    // O padrão da Drop é 24/7, então o bloco de horário SEMPRE entra dizendo isso.
    expect(p).toContain('HORÁRIO DE ATENDIMENTO')
    expect(p).toContain('24 horas por dia, todos os dias')
  })
  it('injeta nome, horário e informações adicionais', () => {
    const p = buildSystemPrompt({ ...DEFAULT_SETTINGS, persona_name: 'Bia', extra_info: 'Estacionamento próprio.', business_hours: { start: 9, end: 18 } }, [])
    expect(p).toContain('Seu nome é Bia')
    expect(p).toContain('Apresente-se como Bia')
    expect(p).not.toContain('Carol')
    expect(p).toContain('HORÁRIO DE ATENDIMENTO')
    expect(p).toContain('das 9h às 18h')
    expect(p).toContain('INFORMAÇÕES ADICIONAIS')
    expect(p).toContain('Estacionamento próprio.')
  })
  it('catálogo nunca inclui preço, mesmo com produto com preço', () => {
    const p = buildSystemPrompt(DEFAULT_SETTINGS, [prod])
    expect(p).toContain('CATÁLOGO')
    expect(p).toContain('Site institucional')
    expect(p).not.toContain('R$ 4.000')
    expect(p).toContain('Continua valendo a regra de nunca informar valores.')
  })
  it('produto sem descrição e sem preço renderiza só o nome, sem pontuação sobrando', () => {
    const empty = { ...prod, description: '', price: '' }
    const p = buildSystemPrompt(DEFAULT_SETTINGS, [empty])
    expect(p).toContain('- Site institucional')
    expect(p).not.toContain('- Site institucional:')
    expect(p).not.toContain('- Site institucional (')
  })
  it('guarda de identidade do prompt; se mudar de propósito, atualize', () => {
    expect(buildSystemPrompt(DEFAULT_SETTINGS, []).length).toBe(17102)
  })
})
