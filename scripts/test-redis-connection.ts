// Testa a conexao com o Redis configurado em REDIS_URL (SET/GET com EX).
//
// Uso: npx tsx scripts/test-redis-connection.ts
// Requer REDIS_URL em drop-agency/.env.local

import 'dotenv/config'
import { getRedis } from '../lib/redis/client'

async function main() {
  const redis = getRedis()
  await redis.set('healthcheck:test', 'ok', 'EX', 10)
  const value = await redis.get('healthcheck:test')
  if (value !== 'ok') throw new Error(`esperado 'ok', recebido '${value}'`)
  console.log('OK - conexao com Redis funcionando, SET/GET/EX ok')
  await redis.quit()
}

main().catch((err) => {
  console.error('FALHOU:', err)
  process.exit(1)
})
