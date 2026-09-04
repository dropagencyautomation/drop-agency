import { describe, it, expect, vi, beforeEach } from 'vitest'

const store = { ttl: -2 as number, set: vi.fn(), del: vi.fn(), exists: vi.fn() }
vi.mock('@/lib/redis/client', () => ({
  getRedis: () => ({
    ttl: async () => store.ttl,
    set: store.set,
    del: store.del,
    exists: store.exists,
  }),
}))

const { touchHumanLock, resolveAutoLockSeconds } = await import('./agentLock')

beforeEach(() => {
  store.set.mockClear()
  delete process.env.AGENT_HUMAN_LOCK_MINUTES
})

describe('resolveAutoLockSeconds', () => {
  it('padrão de 60 minutos', () => {
    expect(resolveAutoLockSeconds(undefined)).toBe(3600)
    expect(resolveAutoLockSeconds('')).toBe(3600)
  })
  it('valor válido em minutos', () => {
    expect(resolveAutoLockSeconds('30')).toBe(1800)
  })
  it('valor inválido ou fora da faixa volta ao padrão', () => {
    expect(resolveAutoLockSeconds('abc')).toBe(3600)
    expect(resolveAutoLockSeconds('0')).toBe(3600)
    expect(resolveAutoLockSeconds('99999')).toBe(3600)
  })
})

describe('touchHumanLock', () => {
  it('cria o lock quando não existe', async () => {
    store.ttl = -2
    await touchHumanLock('554196621204')
    expect(store.set).toHaveBeenCalledWith('human_lock:554196621204', '1', 'EX', 3600)
  })

  it('NÃO encurta a pausa manual do CRM', async () => {
    // Caso relatado: clicar em "Atendimento humano" e a IA voltar minutos depois.
    store.ttl = 30 * 24 * 3600
    await touchHumanLock('554196621204')
    expect(store.set).not.toHaveBeenCalled()
  })

  it('renova quando o que resta é menor que a janela automática', async () => {
    store.ttl = 120
    await touchHumanLock('554196621204')
    expect(store.set).toHaveBeenCalled()
  })

  it('normaliza a chave: as duas formas do nono dígito colidem', async () => {
    store.ttl = -2
    await touchHumanLock('5541996621204')
    expect(store.set).toHaveBeenCalledWith('human_lock:554196621204', '1', 'EX', 3600)
  })
})
