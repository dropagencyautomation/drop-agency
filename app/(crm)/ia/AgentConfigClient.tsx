'use client'
import { useState } from 'react'
import type { AgentSettings, AgentProduct } from '@/types/database'
import ProductsCard from './ProductsCard'

const card: React.CSSProperties = { padding: 20, marginBottom: 20 }
const label: React.CSSProperties = { display: 'block', fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: 6 }
const input: React.CSSProperties = { width: '100%', padding: '10px 12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#F9FAFB', fontSize: 13, fontFamily: 'inherit', outline: 'none' }
const btn: React.CSSProperties = { padding: '10px 16px', borderRadius: 8, border: 'none', background: '#E0332B', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }
const btnGhost: React.CSSProperties = { ...btn, background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: 'var(--muted-foreground)' }

export default function AgentConfigClient({ initialSettings, initialProducts }: { initialSettings: AgentSettings; initialProducts: AgentProduct[] }) {
  const [s, setS] = useState(initialSettings)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  const set = <K extends keyof AgentSettings>(k: K, v: AgentSettings[K]) => setS(p => ({ ...p, [k]: v }))

  async function save() {
    setSaving(true); setMsg('')
    const res = await fetch('/api/agent/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ persona_name: s.persona_name, extra_info: s.extra_info, business_hours: s.business_hours }) })
    const j = await res.json()
    setMsg(res.ok ? 'Salvo. Vale a partir da próxima mensagem recebida.' : j.error ?? 'Erro')
    setSaving(false)
  }

  async function reset() {
    if (!confirm('Restaurar nome, horário e informações para o padrão?')) return
    setSaving(true)
    await fetch('/api/agent/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reset' }) })
    setS(p => ({ ...p, persona_name: 'Carol', extra_info: '', business_hours: { start: 8, end: 19 } }))
    setMsg('Padrão restaurado.'); setSaving(false)
  }

  return (
    <div style={{ maxWidth: 860 }}>
      <div className="card-premium" style={card}>
        <h3 style={{ margin: '0 0 14px', fontSize: 14 }}>Agente</h3>
        <label style={label}>Nome do agente</label>
        <input style={{ ...input, marginBottom: 14 }} value={s.persona_name} onChange={e => set('persona_name', e.target.value)} />
        <div style={{ display: 'flex', gap: 12, alignItems: 'end', marginBottom: 14 }}>
          <div><label style={label}>Abre (h)</label><input type="number" min={0} max={23} style={{ ...input, width: 90 }} value={s.business_hours.start} onChange={e => set('business_hours', { ...s.business_hours, start: Number(e.target.value) })} /></div>
          <div><label style={label}>Fecha (h)</label><input type="number" min={1} max={24} style={{ ...input, width: 90 }} value={s.business_hours.end} onChange={e => set('business_hours', { ...s.business_hours, end: Number(e.target.value) })} /></div>
          <span style={{ fontSize: 12, color: 'var(--muted-foreground)', marginLeft: 16, paddingBottom: 10 }}>Padrão 8h–19h. O agente só menciona horário quando alterado.</span>
        </div>
        <label style={label}>Informações adicionais da empresa (endereço, formas de contato, avisos)</label>
        <textarea style={{ ...input, minHeight: 120 }} value={s.extra_info} onChange={e => set('extra_info', e.target.value)} />
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 28 }}>
        <button style={btn} disabled={saving} onClick={save}>{saving ? 'Salvando...' : 'Salvar'}</button>
        <button style={btnGhost} disabled={saving} onClick={reset}>Restaurar padrão</button>
        {msg && <span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>{msg}</span>}
      </div>

      <ProductsCard initial={initialProducts} styles={{ card, label, input, btn, btnGhost }} />
    </div>
  )
}
