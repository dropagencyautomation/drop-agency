'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import type { WaChat, WaMessage } from '@/types/database'
import MessageBubble from './MessageBubble'
import { Avatar } from './ChatList'
import { validateAttachment, MAX_ATTACHMENT_BYTES, DROP_ACCEPT } from '@/lib/inbox/attachments'

const EMOJIS = ('😀 😃 😄 😁 😆 😅 🤣 😂 🙂 🙃 😉 😊 😇 🥰 😍 🤩 😘 😗 😚 😙 😋 😛 😜 🤪 😝 🤗 🤔 🤨 😐 😑 ' +
  '😶 🙄 😏 😣 😥 😮 🤐 😯 😪 😴 😌 😔 🤤 😷 🤒 🥳 🥺 😢 😭 😤 😠 😡 🤯 😳 🥵 🥶 😱 😨 😰 😥 ' +
  '👍 👎 👌 🤝 🙏 👏 🙌 💪 ✍️ 🤞 ✌️ 🫶 ❤️ 🧡 💛 💚 💙 💜 🔥 ✨ 🎉 🎊 💯 ⚡ ✅ ❌ ⭐ 🚀 💰 📈').split(' ')

const dayKey = (iso: string) => new Date(iso).toDateString()

function dayLabel(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  if (dayKey(iso) === today.toDateString()) return 'HOJE'
  if (dayKey(iso) === new Date(today.getTime() - 86400000).toDateString()) return 'ONTEM'
  return d.toLocaleDateString('pt-BR')
}

const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

const iconBtn: React.CSSProperties = {
  width: 38, height: 38, borderRadius: '50%', border: 'none', background: 'transparent',
  color: '#9CA3AF', fontSize: 19, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
}

interface Props {
  chat: WaChat
  messages: WaMessage[]
  hasMore: boolean
  agentPaused: boolean
  onToggleAgent: () => void
  onSend: (text: string, file: File | null) => Promise<void>
  onDelete: (waMessageId: string) => Promise<void>
  onLoadMore: () => void
  userId: string
}

export default function Conversation({ chat, messages, hasMore, agentPaused, onToggleAgent, onSend, onDelete, onLoadMore, userId }: Props) {
  const [text, setText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [sending, setSending] = useState(false)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [recording, setRecording] = useState(false)
  const [secs, setSecs] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)
  const atBottomRef = useRef(true)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const dragDepthRef = useRef(0)
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const cancelRef = useRef(false)
  const startingMicRef = useRef(false)

  // Desliga o microfone se o componente desmontar (troca de chat) com gravação em andamento.
  useEffect(() => () => {
    cancelRef.current = true
    const r = recorderRef.current
    r?.stream.getTracks().forEach(t => t.stop())
    if (r && r.state !== 'inactive') r.stop()
  }, [])

  // Ancoragem do scroll: sempre no fim ao abrir; ao chegar mensagem, só se já estava no fim.
  useEffect(() => {
    const el = scrollRef.current
    if (el) { el.scrollTop = el.scrollHeight; atBottomRef.current = true }
  }, [chat.id])

  useEffect(() => {
    const el = scrollRef.current
    if (el && atBottomRef.current) el.scrollTop = el.scrollHeight
  }, [messages.length])

  useEffect(() => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`
  }, [text])

  useEffect(() => {
    if (!recording) return
    const t = setInterval(() => setSecs(s => s + 1), 1000)
    return () => clearInterval(t)
  }, [recording])

  useEffect(() => () => { if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current) }, [])

  const notify = useCallback((text: string, error: boolean) => {
    setNotice({ text, error })
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current)
    noticeTimerRef.current = setTimeout(() => setNotice(null), 7000)
  }, [])

  // Anexa o primeiro arquivo válido: o composer manda um por vez, então avisamos o que ficou de fora.
  const attachFiles = useCallback((list: File[]) => {
    if (chat.is_group || list.length === 0) return
    const rules = { maxBytes: MAX_ATTACHMENT_BYTES, accept: DROP_ACCEPT }
    const checked = list.map(f => ({ f, r: validateAttachment(f, rules) }))
    const first = checked.find(c => c.r.ok)
    if (!first) {
      const r = checked[0].r
      notify(r.ok ? 'Nenhum arquivo válido.' : r.error, true)
      return
    }
    setFile(first.f)
    if (fileRef.current) fileRef.current.value = ''
    const rest = checked.length - 1
    if (rest > 0) notify(`Anexei ${first.f.name}. Vai um arquivo por vez — os outros ${rest} não foram anexados.`, false)
    else setNotice(null)
  }, [chat.is_group, notify])

  // Colar imagem/vídeo anexa; colar texto segue normal. Grupo fica inerte.
  useEffect(() => {
    if (chat.is_group) return
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? [])
      if (files.length === 0) return
      e.preventDefault()
      attachFiles(files)
    }
    const reset = () => { dragDepthRef.current = 0; setDragging(false) }
    window.addEventListener('paste', onPaste)
    window.addEventListener('dragend', reset)
    return () => { window.removeEventListener('paste', onPaste); window.removeEventListener('dragend', reset) }
  }, [chat.is_group, attachFiles])

  // Guard global: drop de arquivo fora da zona de anexo (composer, cabeçalho,
  // lista de chats) faria o navegador abrir o arquivo e desmontar o CRM,
  // perdendo o texto digitado. Vale também em grupo, onde o drop é inerte.
  useEffect(() => {
    const hasFiles = (e: DragEvent) => Boolean(e.dataTransfer?.types.includes('Files'))
    const onDragOver = (e: DragEvent) => { if (hasFiles(e)) e.preventDefault() }
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      dragDepthRef.current = 0
      setDragging(false)
    }
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('drop', onDrop)
    return () => { window.removeEventListener('dragover', onDragOver); window.removeEventListener('drop', onDrop) }
  }, [])

  const dragHasFiles = (e: React.DragEvent) => e.dataTransfer.types.includes('Files')

  const submit = useCallback(async (t: string, f: File | null) => {
    if (sending || (!t.trim() && !f)) return
    setSending(true)
    try {
      await onSend(t.trim(), f)
      setText(''); setFile(null)
      if (fileRef.current) fileRef.current.value = ''
      atBottomRef.current = true
    } catch { /* o Inbox já avisou o erro */ }
    finally { setSending(false); taRef.current?.focus() }
  }, [onSend, sending])

  function insertEmoji(e: string) {
    const ta = taRef.current
    if (!ta) { setText(t => t + e); return }
    const start = ta.selectionStart ?? text.length
    const end = ta.selectionEnd ?? start
    setText(text.slice(0, start) + e + text.slice(end))
    requestAnimationFrame(() => {
      ta.focus()
      ta.selectionStart = ta.selectionEnd = start + e.length
    })
  }

  function pickMime(): string {
    if (typeof MediaRecorder === 'undefined') return ''
    return ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/ogg', 'audio/mp4']
      .find(t => MediaRecorder.isTypeSupported(t)) ?? ''
  }

  async function startRecording() {
    if (recording || startingMicRef.current) return
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) { alert('Microfone indisponível'); return }
    startingMicRef.current = true
    let stream: MediaStream
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }) }
    catch { alert('Microfone indisponível'); return }
    finally { startingMicRef.current = false }

    const mime = pickMime()
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
    chunksRef.current = []
    cancelRef.current = false
    rec.ondataavailable = e => { if (e.data.size) chunksRef.current.push(e.data) }
    rec.onstop = () => {
      stream.getTracks().forEach(t => t.stop())
      setRecording(false); setSecs(0)
      if (cancelRef.current) return
      const type = rec.mimeType || 'audio/webm'
      const blob = new Blob(chunksRef.current, { type })
      if (!blob.size) return
      const ext = type.includes('ogg') ? 'ogg' : type.includes('mp4') ? 'm4a' : 'webm'
      // ponytail: manda o webm/opus cru; se a Uazapi recusar, cai como documento (ver Task 7)
      void submit('', new File([blob], `voice-${Date.now()}.${ext}`, { type }))
    }
    recorderRef.current = rec
    rec.start()
    setSecs(0); setRecording(true)
  }

  function stopRecording(cancel: boolean) {
    cancelRef.current = cancel
    recorderRef.current?.stop()
  }

  const canSend = Boolean(text.trim() || file)

  return (
    <>
      {/* Cabeçalho */}
      <div style={{
        background: '#111111', height: 60, flexShrink: 0, padding: '0 16px',
        display: 'flex', alignItems: 'center', gap: 13,
      }}>
        <Avatar url={chat.avatar_url} name={chat.name} phone={chat.phone} size={40} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: '#F9FAFB', fontSize: 16, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {chat.name || chat.phone}
          </div>
          <div style={{ color: '#9CA3AF', fontSize: 12 }}>{chat.is_group ? 'Grupo' : chat.phone}</div>
        </div>

        {chat.lead_id && (
          <Link href="/leads" style={{
            fontSize: 12, color: '#9CA3AF', textDecoration: 'none', border: '1px solid #1a1a1a',
            borderRadius: 14, padding: '5px 11px', whiteSpace: 'nowrap',
          }}>🔗 Ver lead</Link>
        )}

        {!chat.is_group && (
          <button onClick={onToggleAgent} title="Alternar entre a Carol e o atendimento humano"
            style={{
              display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', whiteSpace: 'nowrap',
              background: agentPaused ? '#ffb02e1f' : '#E53E3E1f',
              border: `1px solid ${agentPaused ? '#ffb02e' : '#E53E3E'}`,
              color: agentPaused ? '#ffb02e' : '#E53E3E',
              borderRadius: 16, padding: '6px 12px', fontSize: 12, fontWeight: 500,
            }}>
            <span style={{
              width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
              background: agentPaused ? '#ffb02e' : '#E53E3E',
            }} />
            {agentPaused ? 'Atendimento humano' : 'Carol ativa'}
            <span style={{ opacity: 0.7, fontSize: 11 }}>{agentPaused ? '▶' : '⏸'}</span>
          </button>
        )}
      </div>

      {/* Mensagens (área de soltar arquivo) */}
      <div
        style={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex', flexDirection: 'column' }}
        onDragEnter={e => {
          if (chat.is_group || !dragHasFiles(e)) return
          e.preventDefault()
          dragDepthRef.current += 1
          setDragging(true)
        }}
        onDragOver={e => {
          if (chat.is_group || !dragHasFiles(e)) return
          e.preventDefault()
          e.dataTransfer.dropEffect = 'copy'
        }}
        onDragLeave={() => {
          // contador de profundidade: dragleave também dispara ao passar por elementos filhos
          if (dragDepthRef.current === 0) return
          dragDepthRef.current -= 1
          if (dragDepthRef.current === 0) setDragging(false)
        }}
        onDrop={e => {
          if (chat.is_group) return
          e.preventDefault()
          dragDepthRef.current = 0
          setDragging(false)
          attachFiles(Array.from(e.dataTransfer.files))
        }}
      >
      {dragging && (
        <div style={{
          position: 'absolute', inset: 12, zIndex: 5, pointerEvents: 'none',
          border: '2px dashed #E53E3E', borderRadius: 12, background: '#070707d9',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          <div style={{ fontSize: 34 }}>📎</div>
          <div style={{ color: '#F9FAFB', fontSize: 16 }}>Solte para anexar</div>
          <div style={{ color: '#9CA3AF', fontSize: 12 }}>Imagem ou vídeo, até {Math.round(MAX_ATTACHMENT_BYTES / (1024 * 1024))} MB · um por vez</div>
        </div>
      )}
      <div
        ref={scrollRef}
        onScroll={e => {
          const el = e.currentTarget
          atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
        }}
        style={{
          flex: 1, overflowY: 'auto', minHeight: 0, padding: '12px 8%',
          background: '#070707',
          backgroundImage: 'radial-gradient(#ffffff08 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      >
        {hasMore && (
          <div style={{ textAlign: 'center', margin: '4px 0 12px' }}>
            <button onClick={onLoadMore} style={{
              background: '#1a1a1a', border: 'none', color: '#9CA3AF', fontSize: 12,
              borderRadius: 14, padding: '6px 14px', cursor: 'pointer',
            }}>Carregar anteriores</button>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={m.id}>
            {(i === 0 || dayKey(m.timestamp) !== dayKey(messages[i - 1].timestamp)) && (
              <div style={{ display: 'flex', justifyContent: 'center', margin: '14px 0' }}>
                <span style={{
                  background: '#1a1a1a', color: '#9CA3AF', fontSize: 11, fontWeight: 500,
                  borderRadius: 8, padding: '5px 12px', textTransform: 'uppercase', letterSpacing: '0.03em',
                }}>{dayLabel(m.timestamp)}</span>
              </div>
            )}
            <MessageBubble m={m} meId={userId} onDelete={onDelete} />
          </div>
        ))}
      </div>
      </div>

      {/* Composer */}
      {chat.is_group ? (
        <div style={{
          background: '#111111', flexShrink: 0, padding: '18px 16px', textAlign: 'center',
          color: '#9CA3AF', fontSize: 13,
        }}>Envio para grupos indisponível</div>
      ) : (
        <div style={{ background: '#111111', flexShrink: 0, position: 'relative' }}>
          {emojiOpen && (
            <>
              <div onClick={() => setEmojiOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 10 }} />
              <div style={{
                position: 'absolute', bottom: '100%', left: 10, zIndex: 11, width: 330, maxHeight: 240,
                overflowY: 'auto', background: '#233138', border: '1px solid #1a1a1a', borderRadius: 10,
                padding: 8, display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 2,
                boxShadow: '0 6px 24px #0008',
              }}>
                {EMOJIS.map((e, i) => (
                  <button key={i} onClick={() => insertEmoji(e)} style={{
                    background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 19, padding: 3, borderRadius: 5,
                  }}
                    onMouseEnter={ev => (ev.currentTarget.style.background = '#1a1a1a')}
                    onMouseLeave={ev => (ev.currentTarget.style.background = 'transparent')}
                  >{e}</button>
                ))}
              </div>
            </>
          )}

          {notice && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px',
              borderBottom: '1px solid #1a1a1a', fontSize: 13,
              color: notice.error ? '#f15c6d' : '#9CA3AF',
            }}>
              <span style={{ flex: 1, minWidth: 0 }}>{notice.text}</span>
              <button onClick={() => setNotice(null)} style={{ ...iconBtn, width: 26, height: 26, fontSize: 15 }}>✕</button>
            </div>
          )}

          {file && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px',
              borderBottom: '1px solid #1a1a1a', color: '#F9FAFB', fontSize: 13,
            }}>
              <span style={{ fontSize: 17 }}>📎</span>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {file.name} <span style={{ color: '#9CA3AF' }}>({Math.round(file.size / 1024)} KB)</span>
              </span>
              <button onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = '' }}
                style={{ ...iconBtn, width: 26, height: 26, fontSize: 15 }}>✕</button>
            </div>
          )}

          {recording ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px' }}>
              <button onClick={() => stopRecording(true)} style={{ ...iconBtn, color: '#f15c6d' }} title="Cancelar">✕</button>
              <span style={{
                width: 9, height: 9, borderRadius: '50%', background: '#f15c6d', flexShrink: 0,
              }} />
              <span style={{ flex: 1, color: '#f15c6d', fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>
                {mmss(secs)} · gravando áudio
              </span>
              <button onClick={() => stopRecording(false)} style={{ ...iconBtn, color: '#E53E3E', fontSize: 20 }} title="Enviar">➤</button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, padding: '8px 12px' }}>
              <button onClick={() => setEmojiOpen(o => !o)} style={iconBtn} title="Emojis">😊</button>
              <button onClick={() => fileRef.current?.click()} style={iconBtn} title="Anexar">📎</button>
              <input
                ref={fileRef} type="file" hidden
                accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip"
                onChange={e => setFile(e.target.files?.[0] ?? null)}
              />
              <textarea
                ref={taRef} rows={1} value={text} disabled={sending}
                onChange={e => setText(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void submit(text, file) }
                }}
                placeholder="Mensagem"
                style={{
                  flex: 1, resize: 'none', background: '#1a1a1a', border: 'none', outline: 'none',
                  color: '#F9FAFB', fontSize: 15, lineHeight: '20px', padding: '9px 12px',
                  borderRadius: 8, maxHeight: 120, fontFamily: 'inherit',
                }}
              />
              {canSend ? (
                <button onClick={() => void submit(text, file)} disabled={sending}
                  style={{ ...iconBtn, color: sending ? '#9CA3AF' : '#E53E3E', fontSize: 20 }} title="Enviar">➤</button>
              ) : (
                <button onClick={startRecording} disabled={sending} style={iconBtn} title="Gravar áudio">🎤</button>
              )}
            </div>
          )}
        </div>
      )}
    </>
  )
}
