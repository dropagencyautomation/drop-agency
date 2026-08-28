import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/inbox/auth'
import { pauseAgent, resumeAgent, isAgentPaused } from '@/lib/inbox/agentLock'

export const dynamic = 'force-dynamic'
const phoneOf = (id: string) => decodeURIComponent(id).replace(/@.*$/, '')

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(); if (!auth.ok) return auth.res
  const { id } = await params
  return NextResponse.json({ paused: await isAgentPaused(phoneOf(id)) })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(); if (!auth.ok) return auth.res
  const { id } = await params
  if (decodeURIComponent(id).endsWith('@g.us')) return NextResponse.json({ error: 'Grupo' }, { status: 400 })
  const { paused } = await req.json()
  if (paused) await pauseAgent(phoneOf(id)); else await resumeAgent(phoneOf(id))
  return NextResponse.json({ paused: Boolean(paused) })
}
