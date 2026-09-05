import { describe, it, expect } from 'vitest'
import { parseRedisInfo, summarizeRedisInfo } from './redisInfo'

const SAMPLE = [
  '# Server', 'redis_version:7.2.4', 'uptime_in_seconds:86400', '',
  '# Clients', 'connected_clients:3',
  '# Memory', 'used_memory_human:1.50M', 'maxmemory_human:0B',
  '# Stats', 'evicted_keys:0', 'expired_keys:42',
  '# Keyspace', 'db0:keys=7,expires=5,avg_ttl=1000',
].join('\r\n')

describe('parseRedisInfo', () => {
  it('ignora seções e linhas vazias, mantém valores com dois-pontos', () => {
    const p = parseRedisInfo(SAMPLE)
    expect(p.redis_version).toBe('7.2.4')
    expect(p.db0).toBe('keys=7,expires=5,avg_ttl=1000')
    expect(Object.keys(p)).not.toContain('# Server')
    expect(parseRedisInfo('')).toEqual({})
  })
})

describe('summarizeRedisInfo', () => {
  it('monta o resumo com números convertidos', () => {
    expect(summarizeRedisInfo(SAMPLE)).toEqual({
      redis_version: '7.2.4', uptime_in_seconds: 86400, used_memory_human: '1.50M',
      maxmemory_human: '0B', evicted_keys: 0, expired_keys: 42, connected_clients: 3,
      db0: 'keys=7,expires=5,avg_ttl=1000',
    })
  })
  it('campos ausentes ficam undefined', () => {
    expect(summarizeRedisInfo('# Server\nredis_version:6.0').connected_clients).toBeUndefined()
  })
})
