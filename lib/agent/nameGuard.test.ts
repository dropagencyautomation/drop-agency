import { describe, it, expect } from 'vitest'
import { leadSaidName } from './nameGuard'

describe('leadSaidName', () => {
  it('nome dito pelo lead', () => {
    expect(leadSaidName('Jhessica', ['oi, sou a Jhessica'])).toBe(true)
  })
  it('ignora acento e caixa nos dois lados', () => {
    expect(leadSaidName('Jhéssica', ['aqui e a jhessica!'])).toBe(true)
    expect(leadSaidName('jhessica', ['Sou a JHÉSSICA'])).toBe(true)
  })
  it('nome que só aparece fora dos textos do lead', () => {
    // "Paula" veio de mensagem manual da atendente, não do lead
    expect(leadSaidName('Paula', ['oi', 'quero saber dos serviços'])).toBe(false)
  })
  it('nome composto: basta um dos tokens', () => {
    expect(leadSaidName('Ana Paula Souza', ['me chamo ana'])).toBe(true)
    expect(leadSaidName('J. Carlos', ['me chamo J. Carlos'])).toBe(true)
    expect(leadSaidName('Sr. Roberto', ['aqui é o Roberto'])).toBe(true)
    expect(leadSaidName("D'Ávila", ["sou o d'avila"])).toBe(true)
  })
  it('partícula não prova o nome', () => {
    expect(leadSaidName('Maria da Silva', ['quero saber da promoção'])).toBe(false)
  })
  it('undefined e vazio', () => {
    expect(leadSaidName(undefined, ['ana'])).toBe(false)
    expect(leadSaidName('', ['ana'])).toBe(false)
    expect(leadSaidName('Ana', [])).toBe(false)
  })
  it('nome de 1 letra', () => {
    expect(leadSaidName('A', ['a Ana'])).toBe(false)
  })
  it('não casa substring de outra palavra', () => {
    expect(leadSaidName('Ana', ['banana'])).toBe(false)
  })
})
