import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/redis/client', () => ({
  getRedis: () => ({
    set: async () => 'OK',
    // sendText registra o texto enviado num conjunto (SADD + EXPIRE) dentro de um MULTI.
    multi: () => { const m = { sadd: () => m, expire: () => m, exec: async () => [] }; return m },
  }),
}))

const fetchMock = vi.fn(async (): Promise<Partial<Response>> => ({ ok: true, json: async () => ({ id: 'x', messageid: 'x' }) }))
vi.stubGlobal('fetch', fetchMock)
process.env.UAZAPI_BASE_URL = 'https://uaz.test'
process.env.UAZAPI_TOKEN = 't'

const { sendSplitText } = await import('./client')

// Três parágrafos → três blocos.
const TEXT = 'Primeiro bloco.\n\nSegundo bloco.\n\nTerceiro bloco.'

beforeEach(() => { fetchMock.mockClear(); vi.useFakeTimers() })
afterEach(() => vi.useRealTimers())

describe('sendSplitText', () => {
  it('sem shouldStop envia todos os blocos (comportamento antigo)', async () => {
    const p = sendSplitText('5511999999999', TEXT)
    await vi.runAllTimersAsync()
    expect(await p).toEqual({ sent: 3, total: 3, failed: false })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('para no bloco seguinte quando um humano assume no meio', async () => {
    // Pausa acionada depois do primeiro bloco sair.
    let paused = false
    const shouldStop = vi.fn(async () => paused)
    const p = sendSplitText('5511999999999', TEXT, shouldStop)
    await vi.advanceTimersByTimeAsync(10) // primeiro bloco sai
    paused = true
    await vi.runAllTimersAsync()
    expect(await p).toEqual({ sent: 1, total: 3, failed: false })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('pausado antes do primeiro bloco não envia nada', async () => {
    const p = sendSplitText('5511999999999', TEXT, async () => true)
    await vi.runAllTimersAsync()
    expect(await p).toEqual({ sent: 0, total: 3, failed: false })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('sendSplitText: falha no meio do envio', () => {
  it('devolve o que chegou e failed=true em vez de lançar', async () => {
    let call = 0
    fetchMock.mockImplementation(async () => {
      call++
      if (call === 2) return { ok: false, status: 500, text: async () => 'boom' } as Partial<Response>
      return { ok: true, status: 200, json: async () => ({ id: 'x', messageid: 'x' }) } as Partial<Response>
    })
    const p = sendSplitText('5511999999999', TEXT)
    await vi.runAllTimersAsync()
    expect(await p).toEqual({ sent: 1, total: 3, failed: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
