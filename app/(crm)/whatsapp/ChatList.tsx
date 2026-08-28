'use client'

import type { WaChat } from '@/types/database'

function listTime(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const today = new Date()
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()
  if (sameDay(d, today)) return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const yesterday = new Date(today.getTime() - 86400000)
  if (sameDay(d, yesterday)) return 'Ontem'
  return d.toLocaleDateString('pt-BR')
}

export function initialsOf(name: string | null, phone: string): string {
  const base = (name ?? '').trim() || phone
  return base.slice(0, 1).toUpperCase()
}

export function Avatar({ url, name, phone, size }: { url: string | null; name: string | null; phone: string; size: number }) {
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt="" width={size} height={size}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
    )
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: '#6a7175', flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#e9edef', fontSize: size * 0.4, fontWeight: 500,
    }}>{initialsOf(name, phone)}</div>
  )
}

interface Props {
  chats: WaChat[]
  activeId: string | null
  search: string
  onSearch: (v: string) => void
  onSelect: (id: string) => void
  onSync: () => void
  syncing: boolean
  syncInfo: string | null
}

export default function ChatList({ chats, activeId, search, onSearch, onSelect, onSync, syncing, syncInfo }: Props) {
  const q = search.trim().toLowerCase()
  const visible = q
    ? chats.filter(c => (c.name ?? '').toLowerCase().includes(q) || c.phone.includes(q))
    : chats

  return (
    <>
      <div style={{
        background: '#202c33', height: 60, flexShrink: 0, padding: '0 16px',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <div style={{ flex: 1, color: '#e9edef', fontSize: 16, fontWeight: 500 }}>Conversas</div>
        {syncInfo && <span style={{ fontSize: 11, color: '#8696a0' }}>{syncInfo}</span>}
        <button
          onClick={onSync} disabled={syncing} title="Sincronizar com o WhatsApp"
          style={{
            width: 34, height: 34, borderRadius: '50%', border: 'none', background: 'transparent',
            color: syncing ? '#8696a0' : '#aebac1', fontSize: 17,
            cursor: syncing ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = '#2a3942')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >{syncing ? '…' : '↻'}</button>
      </div>

      <div style={{ padding: '8px 12px', flexShrink: 0, background: '#111b21' }}>
        <input
          value={search} onChange={e => onSearch(e.target.value)}
          placeholder="Pesquisar ou começar uma nova conversa"
          style={{
            width: '100%', background: '#202c33', border: 'none', borderRadius: 8,
            padding: '8px 14px', fontSize: 13, color: '#e9edef', outline: 'none',
          }}
        />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {visible.length === 0 && (
          <div style={{ padding: '32px 16px', textAlign: 'center', color: '#8696a0', fontSize: 13 }}>
            {chats.length === 0 ? 'Nenhuma conversa ainda. Use ↻ para sincronizar.' : 'Nada encontrado.'}
          </div>
        )}
        {visible.map(c => {
          const isActive = c.id === activeId
          return (
            <div key={c.id} onClick={() => onSelect(c.id)}
              role="button" tabIndex={0} aria-label={c.name || c.phone}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(c.id) }
              }}
              style={{
                display: 'flex', alignItems: 'center', gap: 13, height: 72, padding: '10px 16px',
                cursor: 'pointer', background: isActive ? '#2a3942' : 'transparent',
                borderBottom: '1px solid #222d34',
              }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#202c33' }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
            >
              <Avatar url={c.avatar_url} name={c.name} phone={c.phone} size={49} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <div style={{
                    flex: 1, minWidth: 0, color: '#e9edef', fontSize: 17,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{c.name || c.phone}</div>
                  <div style={{ fontSize: 12, color: c.unread_count > 0 ? '#00a884' : '#8696a0', flexShrink: 0 }}>
                    {listTime(c.last_message_at)}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                  <div style={{
                    flex: 1, minWidth: 0, color: '#8696a0', fontSize: 14,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {c.is_group && <span style={{ marginRight: 4 }}>👥</span>}
                    {c.last_preview ?? ''}
                  </div>
                  {c.unread_count > 0 && (
                    <span style={{
                      background: '#00a884', color: '#111b21', fontSize: 11, fontWeight: 600,
                      minWidth: 19, height: 19, borderRadius: 10, padding: '0 6px', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>{c.unread_count}</span>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
