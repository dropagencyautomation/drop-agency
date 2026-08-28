'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { WaChat } from '@/types/database'
import Inbox from './Inbox'

export default function InboxLoader() {
  const [data, setData] = useState<{ chats: WaChat[]; userId: string } | null>(null)
  useEffect(() => {
    const sb = createClient()
    Promise.all([
      sb.auth.getUser(),
      sb.from('wa_chats').select('*').order('last_message_at', { ascending: false, nullsFirst: false }).limit(300),
    ]).then(([u, c]) => setData({ chats: (c.data ?? []) as WaChat[], userId: u.data.user?.id ?? '' }))
  }, [])
  if (!data) return <div style={{ padding: 28, color: '#9CA3AF', fontSize: 13 }}>Carregando conversas...</div>
  return <div style={{ height: '100%' }}><Inbox initialChats={data.chats} userId={data.userId} /></div>
}
