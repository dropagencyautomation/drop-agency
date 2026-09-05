import { NextRequest, NextResponse } from 'next/server'
import type Redis from 'ioredis'
import { requireAdmin } from '@/lib/agent/admin'
import { getRedis } from '@/lib/redis/client'
import { humanLockKey, botSendingKey, latestMsgKey, processingKey } from '@/lib/agent/keys'
import { phoneKey } from '@/lib/inbox/whitelist'
import { summarizeRedisInfo } from '@/lib/agent/redisInfo'

export const dynamic = 'force-dynamic'

// Diagnóstico somente leitura do Redis de produção (só alcançável de dentro da VPS).
const PREFIXES = ['human_lock', 'bot:sending', 'latest_msg', 'processing'] as const
const MAX_KEYS = 50
const TIMEOUT_MS = 5000

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e))

async function inspectKey(redis: Redis, key: string) {
  const [ttlSeconds, value] = await Promise.all([redis.ttl(key), redis.get(key)])
  return { key, exists: value !== null, ttlSeconds, value }
}

async function scanPrefix(redis: Redis, prefix: string) {
  const keys: string[] = []
  let cursor = '0'
  // SCAN em vez de KEYS pra não travar o servidor.
  do {
    const [next, batch] = await redis.scan(cursor, 'MATCH', `${prefix}:*`, 'COUNT', 200)
    cursor = next
    keys.push(...batch)
  } while (cursor !== '0')
  const shown = keys.slice(0, MAX_KEYS)
  return {
    total: keys.length,
    truncated: keys.length > MAX_KEYS,
    keys: await Promise.all(shown.map((k) => inspectKey(redis, k))),
  }
}

async function diagnose(phone: string | null) {
  const out: Record<string, unknown> = { ok: true }
  const redis = getRedis()

  const t0 = Date.now()
  try {
    out.ping = { result: await redis.ping(), latencyMs: Date.now() - t0 }
  } catch (e) {
    out.ok = false
    out.ping = { result: errText(e), latencyMs: Date.now() - t0 }
    return out // sem PING nada abaixo vai responder
  }

  try {
    const info = await redis.info()
    const server: Record<string, unknown> = { ...summarizeRedisInfo(info) }
    try {
      const cfg = await redis.config('GET', 'maxmemory-policy') as string[]
      server.maxmemory_policy = cfg[1]
    } catch (e) {
      server.maxmemory_policy_error = errText(e) // CONFIG costuma estar bloqueado em Redis gerenciado
    }
    out.server = server
  } catch (e) {
    out.ok = false
    out.server = { error: errText(e) }
  }

  try {
    const agentKeys: Record<string, unknown> = {}
    for (const p of PREFIXES) agentKeys[p] = await scanPrefix(redis, p)
    out.agentKeys = agentKeys
  } catch (e) {
    out.ok = false
    out.agentKeys = { error: errText(e) }
  }

  if (phone) {
    try {
      const derived = [humanLockKey(phone), botSendingKey(phone), latestMsgKey(phone), processingKey(phone)]
      out.phone = { input: phone, phoneKey: phoneKey(phone), keys: await Promise.all(derived.map((k) => inspectKey(redis, k))) }
    } catch (e) {
      out.ok = false
      out.phone = { input: phone, error: errText(e) }
    }
  }
  return out
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.res

  const phone = req.nextUrl.searchParams.get('phone')
  const timeout = new Promise<Record<string, unknown>>((resolve) =>
    setTimeout(() => resolve({ ok: false, error: `Redis não respondeu em ${TIMEOUT_MS}ms` }), TIMEOUT_MS)
  )
  try {
    const body = await Promise.race([diagnose(phone), timeout])
    return NextResponse.json(body)
  } catch (e) {
    console.error('[admin/redis] falha no diagnóstico:', errText(e))
    return NextResponse.json({ ok: false, error: errText(e) })
  }
}
