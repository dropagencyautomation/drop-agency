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

  const alwaysOn = s.business_hours.start === 0 && s.business_hours.end === 24

  const set = <K extends keyof AgentSettings>(k: K, v: AgentSettings[K]) => setS(p => ({ ...p, [k]: v }))

  async function save() {
    setSaving(true); setMsg('')
    try {
      const res = await fetch('/api/agent/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ persona_name: s.persona_name, extra_info: s.extra_info, business_hours: s.business_hours, human_lock_minutes: s.human_lock_minutes, debounce_ms: s.debounce_ms }) })
      const j = await res.json()
      setMsg(res.ok ? 'Salvo. Vale a partir da próxima mensagem recebida.' : j.error ?? 'Erro')
    } catch {
      setMsg('Falha de rede. Tente novamente.')
    } finally {
      setSaving(false)
    }
  }

  async function reset() {
    if (!confirm('Restaurar nome, horário e informações para o padrão?')) return
    setSaving(true)
    try {
      const res = await fetch('/api/agent/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reset' }) })
      const j = await res.json()
      if (!res.ok) { setMsg(j.error ?? 'Erro'); return }
      setS(p => ({ ...p, persona_name: 'Carol', extra_info: '', business_hours: { start: 0, end: 24 }, human_lock_minutes: 4320, debounce_ms: 6000 }))
      setMsg('Padrão restaurado.')
    } catch {
      setMsg('Falha de rede. Tente novamente.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ maxWidth: 860 }}>
      <div className="card-premium" style={card}>
        <h3 style={{ margin: '0 0 14px', fontSize: 14 }}>Agente</h3>
        <label style={label}>Nome do agente</label>
        <input style={{ ...input, marginBottom: 14 }} value={s.persona_name} onChange={e => set('persona_name', e.target.value)} />
        <div style={{ display: 'flex', gap: 12, alignItems: 'end', marginBottom: 14 }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, paddingBottom: 10 }}>
            <input type="checkbox" checked={alwaysOn} onChange={e => set('business_hours', e.target.checked ? { start: 0, end: 24 } : { start: 8, end: 19 })} />
            Atende 24 horas, todos os dias
          </label>
          {!alwaysOn && <>
            <div><label style={label}>Abre (h)</label><input type="number" min={0} max={23} style={{ ...input, width: 90 }} value={s.business_hours.start} onChange={e => set('business_hours', { ...s.business_hours, start: Number(e.target.value) })} /></div>
            <div><label style={label}>Fecha (h)</label><input type="number" min={1} max={24} style={{ ...input, width: 90 }} value={s.business_hours.end} onChange={e => set('business_hours', { ...s.business_hours, end: Number(e.target.value) })} /></div>
          </>}
          <span style={{ fontSize: 12, color: 'var(--muted-foreground)', marginLeft: 16, paddingBottom: 10 }}>
            {alwaysOn ? 'O agente responde a qualquer hora e nunca manda o lead esperar o horário comercial.' : 'Fora desse horário o agente continua respondendo, mas informa a faixa quando perguntado.'}
          </span>
        </div>
        <div style={{ borderTop: '1px solid var(--border)', margin: '18px 0 16px' }} />
        <h4 style={{ margin: '0 0 4px', fontSize: 13, color: '#F9FAFB' }}>Tempos do atendimento</h4>
        <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--muted-foreground)' }}>
          Vale a partir da próxima mensagem recebida, sem precisar de deploy.
        </p>
        <div style={{ display: 'flex', gap: 20, alignItems: 'start', marginBottom: 16, flexWrap: 'wrap' }}>
          <div style={{ maxWidth: 300 }}>
            <label style={label}>Pausa da IA ao responder pelo celular (horas)</label>
            {/* Guardado em minutos; a tela fala em horas porque a janela é de dias, não de minutos.
                Valor legado < 30 min mostra 1 (sem mexer, salva o valor original); campo vazio vira 1h, não 0. */}
            <input type="number" min={1} max={720} style={{ ...input, width: 110 }}
              value={Math.max(1, Math.round(s.human_lock_minutes / 60))}
              onChange={e => set('human_lock_minutes', Math.max(60, Math.round(Number(e.target.value) * 60)))} />
            <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--muted-foreground)', lineHeight: 1.5 }}>
              Quando alguém responde o lead pelo WhatsApp no celular, a IA fica em silêncio por esse tempo (padrão: 72 horas).
              O botão &quot;Atendimento humano&quot; aqui no CRM é diferente: pausa até você devolver a conversa para a IA, sem prazo.
            </p>
          </div>
          <div style={{ maxWidth: 300 }}>
            <label style={label}>Espera antes de responder (segundos)</label>
            <input type="number" min={0.5} max={30} step={0.5} style={{ ...input, width: 110 }}
              value={s.debounce_ms / 1000}
              onChange={e => set('debounce_ms', Math.round(Number(e.target.value) * 1000))} />
            <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--muted-foreground)', lineHeight: 1.5 }}>
              Tempo que a IA aguarda para juntar mensagens seguidas do lead numa resposta só.
              Menor = resposta mais rápida, porém mais risco de responder antes de o lead terminar de escrever.
            </p>
          </div>
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
