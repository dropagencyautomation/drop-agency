'use client'
import { useState } from 'react'
import type { AgentProduct } from '@/types/database'

type Styles = Record<'card' | 'label' | 'input' | 'btn' | 'btnGhost', React.CSSProperties>
const empty = { name: '', description: '', price: '', photo_url: null as string | null, is_active: true }

export default function ProductsCard({ initial, styles: st }: { initial: AgentProduct[]; styles: Styles }) {
  const [items, setItems] = useState(initial)
  const [form, setForm] = useState<typeof empty & { id?: string }>(empty)
  const [busy, setBusy] = useState(false)

  async function upload(file: File) {
    const fd = new FormData(); fd.append('file', file)
    const res = await fetch('/api/agent/products/upload', { method: 'POST', body: fd })
    const j = await res.json()
    if (res.ok) setForm(f => ({ ...f, photo_url: j.url })); else alert(j.error)
  }

  async function submit() {
    if (!form.name.trim()) return alert('Nome obrigatório')
    setBusy(true)
    const method = form.id ? 'PATCH' : 'POST'
    const res = await fetch('/api/agent/products', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    const j = await res.json()
    if (!res.ok) { alert(j.error); setBusy(false); return }
    setItems(list => form.id ? list.map(p => p.id === form.id ? j.product : p) : [...list, j.product])
    setForm(empty); setBusy(false)
  }

  async function remove(id: string) {
    if (!confirm('Remover produto?')) return
    await fetch(`/api/agent/products?id=${id}`, { method: 'DELETE' })
    setItems(list => list.filter(p => p.id !== id))
  }

  return (
    <div className="card-premium" style={st.card}>
      <h3 style={{ margin: '0 0 14px', fontSize: 14 }}>Produtos e serviços</h3>
      {items.map(p => (
        <div key={p.id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)', opacity: p.is_active ? 1 : 0.5 }}>
          {p.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.photo_url} alt="" style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover' }} />
          ) : <div style={{ width: 44, height: 44, borderRadius: 8, background: 'rgba(255,255,255,0.06)' }} />}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{p.name} {p.price && <span style={{ color: 'var(--muted-foreground)', fontWeight: 400 }}>· {p.price}</span>}</div>
            <div style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>{p.description}</div>
          </div>
          <button style={st.btnGhost} onClick={() => setForm({ id: p.id, name: p.name, description: p.description, price: p.price, photo_url: p.photo_url, is_active: p.is_active })}>Editar</button>
          <button style={st.btnGhost} onClick={() => remove(p.id)}>Remover</button>
        </div>
      ))}
      {items.length === 0 && <p style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>Nenhum produto cadastrado.</p>}

      <div style={{ marginTop: 18, display: 'grid', gap: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 600 }}>{form.id ? 'Editar produto' : 'Novo produto'}</div>
        <input style={st.input} placeholder="Nome" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        <input style={st.input} placeholder="Valor (uso interno; o agente nunca informa preço)" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} />
        <textarea style={{ ...st.input, minHeight: 70 }} placeholder="Descrição" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <input type="file" accept="image/*" onChange={e => e.target.files?.[0] && upload(e.target.files[0])} />
          {form.photo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={form.photo_url} alt="" style={{ width: 36, height: 36, borderRadius: 6, objectFit: 'cover' }} />
          )}
          <label style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} />Ativo</label>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button style={st.btn} disabled={busy} onClick={submit}>{form.id ? 'Salvar' : 'Adicionar'}</button>
          {form.id && <button style={st.btnGhost} onClick={() => setForm(empty)}>Cancelar</button>}
        </div>
      </div>
    </div>
  )
}
