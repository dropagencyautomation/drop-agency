import { createClient } from '@/lib/supabase/server'
import type { WaChat } from '@/types/database'
import Inbox from './Inbox'

export const dynamic = 'force-dynamic'

export default async function WhatsAppPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: chats } = await supabase
    .from('wa_chats')
    .select('*')
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(300)

  return <Inbox initialChats={(chats ?? []) as WaChat[]} userId={user?.id ?? ''} />
}
