import { describe, it, expect } from 'vitest'
import { resolveDebounceMs, latestMsgTtlSeconds } from './debounce'

describe('resolveDebounceMs', () => {
  it('usa o valor da env quando valido', () => {
    expect(resolveDebounceMs('10000')).toBe(10000)
    expect(resolveDebounceMs('500')).toBe(500)
    expect(resolveDebounceMs('30000')).toBe(30000)
  })
  it('cai no padrao quando ausente ou vazio', () => {
    expect(resolveDebounceMs(undefined)).toBe(6000)
    expect(resolveDebounceMs('   ')).toBe(6000)
  })
  it('cai no padrao fora da faixa ou nao numerico', () => {
    expect(resolveDebounceMs('100')).toBe(6000)
    expect(resolveDebounceMs('60000')).toBe(6000)
    expect(resolveDebounceMs('abc')).toBe(6000)
    expect(resolveDebounceMs('1500.5')).toBe(6000)
    expect(resolveDebounceMs('Infinity')).toBe(6000)
  })
})

describe('latestMsgTtlSeconds', () => {
  it('cobre janela + processamento, com piso de 30s', () => {
    expect(latestMsgTtlSeconds(6000)).toBe(30)
    expect(latestMsgTtlSeconds(500)).toBe(30)
    expect(latestMsgTtlSeconds(30000)).toBe(90)
  })
})
