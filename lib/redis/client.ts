import Redis from 'ioredis'

declare global {
  var __redis: Redis | undefined
}

export function getRedis(): Redis {
  if (!global.__redis) {
    global.__redis = new Redis(process.env.REDIS_URL!)
  }
  return global.__redis
}
