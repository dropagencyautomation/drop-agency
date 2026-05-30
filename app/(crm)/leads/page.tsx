import { createClient } from '@/lib/supabase/server'
import Topbar from '@/components/layout/Topbar'
import type { Lead } from '@/types/database'

export const dynamic = 'force-dynamic'

export default async function LeadsPage() {
  const supabase = await createClient()
  const { data: leads } = await supabase
    .from('leads')
    .select('*, pipeline_stages(name, color)')
    .order('created_at', { ascending: false })

  const profileLabel: Record<string, string> = {
    quente: 'Quente', estrategico: 'Estratégico', recorrente: 'Recorrente',
    pontual: 'Pontual', sem_timing: 'Sem timing', curioso: 'Curioso', sem_orcamento: 'Sem orçamento',
  }
  const sourceLabel: Record<string, string> = {
    whatsapp: 'WhatsApp', instagram: 'Instagram', indicacao: 'Indicação',
    networking: 'Networking', meta_ads: 'Meta Ads', google_ads: 'Google Ads', outro: 'Outro',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <Topbar title="Leads" subtitle={`${leads?.length ?? 0} leads cadastrados`} cta={{ label: '+ Lead', href: '/crm/novo' }} />

      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
        <div className="card-premium" style={{ overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Nome', 'Empresa / Nicho', 'Etapa', 'Perfil', 'Origem', 'Score', 'Cadastro'].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(leads ?? []).length === 0 ? (
                <tr><td colSpan={7} style={{ padding: 32, textAlign: 'center', color: 'var(--muted-foreground)', fontSize: 13 }}>Nenhum lead cadastrado ainda.</td></tr>
              ) : (
                (leads ?? []).map((lead: Lead & { pipeline_stages?: { name: string; color: string } }) => (
                  <tr key={lead.id} style={{ borderBottom: '1px solid oklch(1 0 0 / 0.04)', transition: 'background 0.15s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '12px 16px' }}>
                      <a href={`/crm/${lead.id}`} style={{ textDecoration: 'none' }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--foreground)' }}>{lead.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>{lead.phone}</div>
                      </a>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontSize: 12, color: 'var(--foreground)' }}>{lead.company_name ?? '—'}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>{lead.niche ?? '—'}</div>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      {lead.pipeline_stages ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: lead.pipeline_stages.color, flexShrink: 0 }} />
                          <span style={{ fontSize: 11, color: 'var(--foreground)' }}>{lead.pipeline_stages.name}</span>
                        </div>
                      ) : '—'}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      {lead.profile ? (
                        <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: 'oklch(0.62 0.245 27 / 0.12)', color: 'var(--primary)' }}>
                          {profileLabel[lead.profile] ?? lead.profile}
                        </span>
                      ) : '—'}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 11, color: 'var(--muted-foreground)' }}>
                      {sourceLabel[lead.source ?? ''] ?? lead.source ?? '—'}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: (lead.score ?? 0) >= 70 ? 'var(--primary)' : (lead.score ?? 0) >= 40 ? 'var(--warning)' : 'var(--muted-foreground)' }}>
                        {lead.score ?? 0}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 11, color: 'var(--muted-foreground)' }}>
                      {new Date(lead.created_at).toLocaleDateString('pt-BR')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
