import Redis from 'ioredis'

declare global {
  // eslint-disable-next-line no-var
  var __redis: Redis | undefined
}

export function getRedis(): Redis {
  if (!global.__redis) {
    global.__redis = new Redis(process.env.REDIS_URL!)
  }
  return global.__redis
}
