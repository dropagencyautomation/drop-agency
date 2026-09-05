// Parse puro do texto do INFO do Redis ("campo:valor" por linha, seções em "# Nome").
// Separado da rota para dar pra testar sem Redis.
export function parseRedisInfo(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue
    const i = line.indexOf(':')
    if (i < 0) continue
    out[line.slice(0, i)] = line.slice(i + 1)
  }
  return out
}

export interface RedisServerSummary {
  redis_version?: string
  uptime_in_seconds?: number
  used_memory_human?: string
  maxmemory_human?: string
  evicted_keys?: number
  expired_keys?: number
  connected_clients?: number
  db0?: string
}

// Só os campos que interessam pro diagnóstico do agente; o resto do INFO fica fora.
export function summarizeRedisInfo(text: string): RedisServerSummary {
  const info = parseRedisInfo(text)
  const num = (k: string) => (info[k] === undefined ? undefined : Number(info[k]))
  return {
    redis_version: info.redis_version,
    uptime_in_seconds: num('uptime_in_seconds'),
    used_memory_human: info.used_memory_human,
    maxmemory_human: info.maxmemory_human,
    evicted_keys: num('evicted_keys'),
    expired_keys: num('expired_keys'),
    connected_clients: num('connected_clients'),
    db0: info.db0,
  }
}
