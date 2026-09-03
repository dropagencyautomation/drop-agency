'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { WaChat, WaMessage } from '@/types/database'
import ChatList from './ChatList'
import Conversation from './Conversation'

const PAGE = 50

const byRecent = (a: WaChat, b: WaChat) =>
  (b.last_message_at ?? '').localeCompare(a.last_message_at ?? '')

export default function Inbox({ initialChats, userId }: { initialChats: WaChat[]; userId: string }) {
  const supabase = useMemo(() => createClient(), [])
  const [chats, setChats] = useState<WaChat[]>(initialChats)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<WaMessage[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [agentPaused, setAgentPaused] = useState(false)
  const [search, setSearch] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [syncInfo, setSyncInfo] = useState<string | null>(null)
  const activeRef = useRef<string | null>(null)
  const syncInfoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const active = chats.find(c => c.id === activeId) ?? null

  useEffect(() => () => { if (syncInfoTimerRef.current) clearTimeout(syncInfoTimerRef.current) }, [])

  // Tempo real: chats (lista/ordem/não lidas) e mensagens do chat aberto.
  useEffect(() => {
    const channel = supabase
      .channel('inbox')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wa_chats' }, payload => {
        const row = payload.new as WaChat
        if (!row?.id) return
        // chat aberto: não deixa o realtime reintroduzir unread_count vindo do servidor
        const next = row.id === activeRef.current ? { ...row, unread_count: 0 } : row
        setChats(cs => [next, ...cs.filter(c => c.id !== row.id)].sort(byRecent))
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'wa_messages' }, payload => {
        const row = payload.new as WaMessage
        if (row.chat_id !== activeRef.current) return
        setMessages(ms => (ms.some(m => m.id === row.id) ? ms : [...ms, row]))
        if (!row.from_me) {
          // chat aberto = já lido
          setChats(cs => cs.map(c => (c.id === row.chat_id ? { ...c, unread_count: 0 } : c)))
          fetch(`/api/whatsapp/chats/${encodeURIComponent(row.chat_id)}/read`, { method: 'POST' }).catch(() => {})
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'wa_messages' }, payload => {
        const row = payload.new as WaMessage
        setMessages(ms => ms.map(m => (m.id === row.id ? { ...m, ...row } : m)))
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [supabase])

  const selectChat = useCallback(async (id: string) => {
    activeRef.current = id
    setActiveId(id)
    setMessages([])
    setHasMore(false)
    setAgentPaused(false)

    const { data } = await supabase.from('wa_messages').select('*')
      .eq('chat_id', id).order('timestamp', { ascending: false }).limit(PAGE)
    if (activeRef.current !== id) return
    const rows = (data ?? []) as WaMessage[]
    setMessages([...rows].reverse())
    setHasMore(rows.length === PAGE)
    setChats(cs => cs.map(c => (c.id === id ? { ...c, unread_count: 0 } : c)))

    const enc = encodeURIComponent(id)
    fetch(`/api/whatsapp/chats/${enc}/read`, { method: 'POST' }).catch(() => {})
    try {
      const r = await fetch(`/api/whatsapp/chats/${enc}/agent`)
      const j = await r.json()
      if (activeRef.current === id) setAgentPaused(Boolean(j.paused))
    } catch { /* Redis fora do ar: assume Carol ativa */ }
  }, [supabase])

  const loadMore = useCallback(async () => {
    const first = messages[0]
    if (!activeId || !first) return
    const { data } = await supabase.from('wa_messages').select('*')
      .eq('chat_id', activeId).lt('timestamp', first.timestamp)
      .order('timestamp', { ascending: false }).limit(PAGE)
    const rows = (data ?? []) as WaMessage[]
    setMessages(ms => [...[...rows].reverse(), ...ms])
    setHasMore(rows.length === PAGE)
  }, [supabase, activeId, messages])

  const toggleAgent = useCallback(async () => {
    if (!activeId) return
    const next = !agentPaused
    setAgentPaused(next)
    try {
      const r = await fetch(`/api/whatsapp/chats/${encodeURIComponent(activeId)}/agent`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paused: next }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? 'falha')
      setAgentPaused(Boolean(j.paused))
    } catch {
      setAgentPaused(!next)
      alert('Não foi possível alterar o status da Carol.')
    }
  }, [activeId, agentPaused])

  const send = useCallback(async (text: string, file: File | null) => {
    if (!activeId) return
    let res: Response
    try {
      if (file) {
        const fd = new FormData()
        fd.append('chatId', activeId)
        fd.append('file', file)
        if (text) fd.append('caption', text)
        res = await fetch('/api/whatsapp/send', { method: 'POST', body: fd })
      } else {
        res = await fetch('/api/whatsapp/send', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chatId: activeId, text }),
        })
      }
    } catch (err) {
      alert('Falha de rede. Tente novamente.')
      throw err
    }
    const j = await res.json().catch(() => ({}))
    if (!res.ok) { alert(j.error ?? 'Falha ao enviar'); throw new Error(j.error ?? 'falha') }
    const m = j.message as WaMessage | null
    if (m) setMessages(ms => (ms.some(x => x.id === m.id) ? ms : [...ms, m]))
    setAgentPaused(true) // o envio pelo CRM pausa a Carol (rota /send)
  }, [activeId])

  const remove = useCallback(async (waMessageId: string) => {
    let res: Response
    try {
      res = await fetch('/api/whatsapp/delete', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ waMessageId }),
      })
    } catch (err) {
      alert('Falha de rede. Tente novamente.')
      throw err
    }
    const j = await res.json().catch(() => ({}))
    if (!res.ok) { alert(j.error ?? 'Falha ao apagar'); throw new Error(j.error ?? 'falha') }
    const m = j.message as WaMessage | null
    if (m) setMessages(ms => ms.map(x => (x.id === m.id ? { ...x, ...m } : x)))
  }, [])

  const sync = useCallback(async () => {
    setSyncing(true); setSyncInfo(null)
    try {
      const r = await fetch('/api/whatsapp/sync', { method: 'POST' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? 'falha')
      setSyncInfo(`${j.chats} chats, ${j.messages} msgs`)
      const { data } = await supabase.from('wa_chats').select('*')
        .order('last_message_at', { ascending: false, nullsFirst: false }).limit(300)
      setChats((data ?? []) as WaChat[])
    } catch {
      setSyncInfo('falha na sincronização')
    } finally {
      setSyncing(false)
      if (syncInfoTimerRef.current) clearTimeout(syncInfoTimerRef.current)
      syncInfoTimerRef.current = setTimeout(() => setSyncInfo(null), 6000)
    }
  }, [supabase])

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '30% 1fr', gridTemplateRows: 'minmax(0, 1fr)', height: '100%', minHeight: 0, overflow: 'hidden', background: '#070707' }}>
      <div style={{ background: '#0a0a0a', borderRight: '1px solid #1f1f1f', minWidth: 0, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <ChatList
          chats={chats} activeId={activeId} search={search}
          onSearch={setSearch} onSelect={selectChat}
          onSync={sync} syncing={syncing} syncInfo={syncInfo}
        />
      </div>
      <div style={{ background: '#070707', minWidth: 0, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {active ? (
          <Conversation
            key={active.id}
            chat={active} messages={messages} hasMore={hasMore}
            agentPaused={agentPaused} onToggleAgent={toggleAgent}
            onSend={send} onDelete={remove} onLoadMore={loadMore} userId={userId}
          />
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, color: '#9CA3AF' }}>
            <div style={{ fontSize: 56, opacity: 0.35 }}>💬</div>
            <div style={{ fontSize: 20, color: '#F9FAFB', fontWeight: 300 }}>Selecione uma conversa</div>
            <div style={{ fontSize: 13 }}>Escolha um chat à esquerda para ver o histórico e responder.</div>
          </div>
        )}
      </div>
    </div>
  )
}
