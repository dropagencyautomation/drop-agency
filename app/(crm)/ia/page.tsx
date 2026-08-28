import Topbar from '@/components/layout/Topbar'
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/agent/admin'
import { resolveSettings } from '@/lib/agent/settings'
import type { AgentProduct } from '@/types/database'
import AgentConfigClient from './AgentConfigClient'

export const dynamic = 'force-dynamic'

export default async function IaPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user!.id).single()
  const isAdmin = profile?.role === 'admin'
  const admin = adminClient()
  const { data: row } = await admin.from('agent_settings').select('*').eq('id', 1).maybeSingle()
  const { data: products } = await admin.from('agent_products').select('*').order('sort_order')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <Topbar title="Agente IA" subtitle="Nome, horário, informações da empresa e catálogo usados pelo agente no WhatsApp" />
      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
        {isAdmin ? (
          <AgentConfigClient initialSettings={resolveSettings(row)} initialProducts={(products ?? []) as AgentProduct[]} />
        ) : (
          <p style={{ color: 'var(--muted-foreground)', fontSize: 13 }}>Somente administradores podem editar o agente.</p>
        )}
      </div>
    </div>
  )
}
