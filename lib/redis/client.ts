import Redis from 'ioredis'

declare global {
  var __redis: Redis | undefined
}

export function getRedis(): Redis {
  if (!global.__redis) {
    // Sem estes limites o ioredis segura cada comando por ~40s quando o Redis
    // cai (fila offline + 20 tentativas), e o webhook fica pendurado em vez de
    // degradar. Com eles, a chamada falha em poucos segundos e os try/catch
    // dos chamadores assumem o comportamento sem Redis.
    global.__redis = new Redis(process.env.REDIS_URL!, {
      commandTimeout: 3000,
      maxRetriesPerRequest: 2,
      retryStrategy: (times) => Math.min(times * 200, 2000),
    })
    global.__redis.on('error', (e) => console.error('[REDIS] erro de conexao:', e.message))
  }
  return global.__redis
}
