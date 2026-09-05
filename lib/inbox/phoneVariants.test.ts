import { describe, it, expect } from 'vitest'
import { phoneVariants } from './phoneVariants'

describe('phoneVariants', () => {
  it('cobre com/sem 55 e com/sem nono dígito a partir do JID', () => {
    const v = phoneVariants('554196621204@s.whatsapp.net')
    expect(v).toEqual(expect.arrayContaining(['554196621204', '5541996621204', '4196621204', '41996621204']))
  })
  it('a partir do formulário formatado sem DDI chega na forma do WhatsApp', () => {
    const v = phoneVariants('(41) 99662-1204')
    expect(v).toEqual(expect.arrayContaining(['554196621204', '5541996621204']))
  })
  it('a forma com nono dígito gera a mesma família da forma sem', () => {
    expect(new Set(phoneVariants('5541996621204'))).toEqual(new Set(phoneVariants('554196621204')))
  })
  it('remove sufixo de dispositivo', () => {
    expect(phoneVariants('5511993414181:12@s.whatsapp.net')).toContain('551193414181')
  })
  it('internacional devolve só os dígitos', () => {
    expect(phoneVariants('+1 (202) 555-0123')).toEqual(['12025550123'])
  })
  it('vazio ou lixo devolve lista vazia', () => {
    expect(phoneVariants('')).toEqual([])
    expect(phoneVariants(null)).toEqual([])
    expect(phoneVariants('abc')).toEqual([])
  })
})
