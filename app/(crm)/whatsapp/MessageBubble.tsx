'use client'

import type { WaMessage } from '@/types/database'

const NAME_COLORS = ['#53bdeb', '#dfb0ea', '#e542a3', '#00a884', '#ffb02e', '#7ec9ff', '#c4b5fd', '#f6a58a']
const colorFor = (name: string) => {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return NAME_COLORS[h % NAME_COLORS.length]
}

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

const URL_RE = /(https?:\/\/[^\s]+)/g

function Linkify({ text }: { text: string }) {
  return (
    <>
      {text.split(URL_RE).map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a key={i} href={part} target="_blank" rel="noreferrer" style={{ color: '#53bdeb', wordBreak: 'break-all' }}>{part}</a>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  )
}

function Ticks({ status }: { status: WaMessage['status'] }) {
  if (status === 'failed') return <span style={{ color: '#f15c6d', fontSize: 12 }} title="Falha no envio">⚠</span>
  const color = status === 'read' ? '#53bdeb' : '#ffffff99'
  return <span style={{ color, fontSize: 12, letterSpacing: -3 }}>{status === 'sent' ? '✓' : '✓✓'}</span>
}

export default function MessageBubble({ m, meId }: { m: WaMessage; meId?: string }) {
  const mine = m.from_me
  const caption = m.text ?? ''

  if (m.type === 'sticker' && m.media_url) {
    return (
      <div style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start', margin: '4px 0' }}>
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={m.media_url} alt="sticker" style={{ width: 160, height: 160, objectFit: 'contain' }} />
          <div style={{ textAlign: 'right', fontSize: 11, color: '#8696a0' }}>{hhmm(m.timestamp)}</div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start', margin: '3px 0' }}>
      <div style={{
        maxWidth: '65%', background: mine ? '#005c4b' : '#202c33', color: '#e9edef',
        borderRadius: 8, padding: '6px 8px 8px', boxShadow: '0 1px .5px #0b141a',
        fontSize: 14.2, lineHeight: 1.4, minWidth: 90,
      }}>
        {!mine && m.sender_name && (
          <div style={{ fontSize: 12.5, fontWeight: 500, color: colorFor(m.sender_name), marginBottom: 2 }}>{m.sender_name}</div>
        )}

        {m.type === 'image' && m.media_url && (
          <a href={m.media_url} target="_blank" rel="noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={m.media_url} alt={caption || 'imagem'}
              style={{ maxWidth: 330, width: '100%', borderRadius: 6, display: 'block', cursor: 'pointer' }} />
          </a>
        )}
        {m.type === 'video' && m.media_url && (
          <video controls src={m.media_url} style={{ maxWidth: 330, width: '100%', borderRadius: 6, display: 'block' }} />
        )}
        {m.type === 'audio' && m.media_url && (
          <audio controls src={m.media_url} style={{ maxWidth: 300, width: 260, display: 'block' }} />
        )}
        {m.type === 'document' && (
          <a href={m.media_url ?? '#'} target="_blank" rel="noreferrer" download
            style={{
              display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none',
              background: '#ffffff14', borderRadius: 6, padding: '10px 12px', color: '#e9edef', minWidth: 220,
            }}>
            <span style={{ fontSize: 22 }}>📄</span>
            <span style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {m.media_name || 'Documento'}
            </span>
          </a>
        )}
        {(m.type === 'other' || (m.type !== 'text' && !m.media_url)) && (
          <div style={{ fontSize: 13, color: '#8696a0', fontStyle: 'italic' }}>
            {m.type === 'other' ? 'Mensagem não suportada' : 'Mídia indisponível'}
          </div>
        )}

        {caption && (
          <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginTop: m.type === 'text' ? 0 : 5 }}>
            <Linkify text={caption} />
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5, marginTop: 2, height: 15 }}>
          {m.ai_generated && (
            <span style={{ fontSize: 9, color: '#00a884', border: '1px solid #00a884', borderRadius: 3, padding: '0 3px', lineHeight: '12px' }}>IA</span>
          )}
          {m.sent_by && (
            <span style={{ fontSize: 9, color: '#ffffff99', border: '1px solid #ffffff40', borderRadius: 3, padding: '0 3px', lineHeight: '12px' }}>
              {m.sent_by === meId ? 'Você' : 'CRM'}
            </span>
          )}
          <span style={{ fontSize: 11, color: '#ffffff99' }}>{hhmm(m.timestamp)}</span>
          {mine && <Ticks status={m.status} />}
        </div>
      </div>
    </div>
  )
}
