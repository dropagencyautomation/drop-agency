'use client'
import { useEffect, useState } from 'react'
import type { AgentSettings, AgentProduct } from '@/types/database'
import AgentConfigClient from './AgentConfigClient'

export default function AgentConfigLoader() {
  const [data, setData] = useState<{ settings: AgentSettings; products: AgentProduct[] } | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    fetch('/api/agent/settings').then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error ?? 'Erro'); setData(j) }).catch(e => setErr(e.message))
  }, [])
  return (
    <div style={{ padding: 28 }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: '#F9FAFB', margin: 0 }}>Agente IA</h2>
      <p style={{ fontSize: 12, color: '#6B7280', margin: '4px 0 20px' }}>Nome, horário, informações da empresa e catálogo usados pelo agente no WhatsApp</p>
      {err && <p style={{ color: '#E53E3E', fontSize: 13 }}>{err}</p>}
      {!data && !err && <p style={{ color: '#9CA3AF', fontSize: 13 }}>Carregando...</p>}
      {data && <AgentConfigClient initialSettings={data.settings} initialProducts={data.products} />}
    </div>
  )
}
