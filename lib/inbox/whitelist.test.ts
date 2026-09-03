import { describe, it, expect } from 'vitest'
import { phoneKey, phoneFromJid, isAllowedChat } from './whitelist'

describe('phoneKey', () => {
  it('chatid com @s.whatsapp.net vira chave de dígitos', () => {
    // A chave canônica é sempre a forma sem o nono dígito: é ela que colapsa as duas variantes.
    expect(phoneKey('5511993414181@s.whatsapp.net')).toBe('551193414181')
  })

  it('as duas formas do nono dígito colapsam na mesma chave', () => {
    // Caso real: whitelist tinha 13 dígitos e o WhatsApp entregava 12.
    expect(phoneKey('5541996621204@s.whatsapp.net')).toBe(phoneKey('554196621204@s.whatsapp.net'))
    expect(phoneKey('554196621204@s.whatsapp.net')).toBe('554196621204')
  })

  it('LID nunca vira telefone', () => {
    expect(phoneKey('265772626636828@lid')).toBeNull()
    expect(phoneKey('101533345661086:28@lid')).toBeNull()
  })

  it('grupo, broadcast e newsletter são rejeitados', () => {
    expect(phoneKey('120363430107511766@g.us')).toBeNull()
    expect(phoneKey('status@broadcast')).toBeNull()
    expect(phoneKey('120363@newsletter')).toBeNull()
  })

  it('sufixo de dispositivo é removido', () => {
    expect(phoneKey('554196621204:12@s.whatsapp.net')).toBe('554196621204')
  })

  it('@c.us (formato antigo) é aceito', () => {
    expect(phoneKey('5511993414181@c.us')).toBe('551193414181')
  })

  it('internacional passa sem a regra do nono dígito', () => {
    expect(phoneKey('12025550123@s.whatsapp.net')).toBe('12025550123')
    expect(phoneKey('351912345678@s.whatsapp.net')).toBe('351912345678')
  })

  it('dígitos crus só passam quando são telefone BR reconhecível', () => {
    expect(phoneKey('5541996621204')).toBe('554196621204')
    expect(phoneKey('265772626636828')).toBeNull() // LID cru, sem sufixo
  })

  it('entrada vazia ou malformada devolve null', () => {
    expect(phoneKey('')).toBeNull()
    expect(phoneKey('   ')).toBeNull()
    expect(phoneKey(null)).toBeNull()
    expect(phoneKey(undefined)).toBeNull()
    expect(phoneKey('não-é-telefone@s.whatsapp.net')).toBeNull()
    expect(phoneKey('@s.whatsapp.net')).toBeNull()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(phoneKey(12345 as any)).toBeNull()
  })
})

describe('phoneFromJid', () => {
  it('preserva a forma real do assinante (não normaliza o nono dígito)', () => {
    expect(phoneFromJid('5511993414181@s.whatsapp.net')).toBe('5511993414181')
    expect(phoneFromJid('554196621204@s.whatsapp.net')).toBe('554196621204')
  })

  it('rejeita o que não é telefone, igual a phoneKey', () => {
    expect(phoneFromJid('265772626636828@lid')).toBeNull()
    expect(phoneFromJid('120363430107511766@g.us')).toBeNull()
    expect(phoneFromJid('')).toBeNull()
    expect(phoneFromJid(null)).toBeNull()
  })

  it('remove o sufixo de dispositivo', () => {
    expect(phoneFromJid('5511993414181:12@s.whatsapp.net')).toBe('5511993414181')
  })
})

describe('isAllowedChat', () => {
  it('aceita número liberado na forma que chega do WhatsApp', () => {
    // Jhessica: cadastrada com o nono dígito, entregue sem ele.
    expect(isAllowedChat('554196621204@s.whatsapp.net')).toBe(true)
    expect(isAllowedChat('5541996621204@s.whatsapp.net')).toBe(true)
    // Leonardo e Edilaine: mesmo caso.
    expect(isAllowedChat('554399301514@s.whatsapp.net')).toBe(true)
    expect(isAllowedChat('554388376610@s.whatsapp.net')).toBe(true)
  })

  it('aceita número liberado que já chegava certo', () => {
    expect(isAllowedChat('554187490574@s.whatsapp.net')).toBe(true)
    expect(isAllowedChat('5511989869931@s.whatsapp.net')).toBe(true)
  })

  it('recusa número fora da lista', () => {
    expect(isAllowedChat('5511999999999@s.whatsapp.net')).toBe(false)
  })

  it('recusa LID, grupo e entrada inválida', () => {
    expect(isAllowedChat('265772626636828@lid')).toBe(false)
    expect(isAllowedChat('120363430107511766@g.us')).toBe(false)
    expect(isAllowedChat('')).toBe(false)
    expect(isAllowedChat(null)).toBe(false)
  })
})
