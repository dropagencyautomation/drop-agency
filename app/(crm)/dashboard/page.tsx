import { createClient } from '@/lib/supabase/server'
import Topbar from '@/components/layout/Topbar'

export const dynamic = 'force-dynamic'

function StatCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: boolean }) {
  return (
    <div className="card-premium" style={{
      padding: 20,
      borderColor: accent ? 'oklch(0.62 0.245 27 / 0.4)' : undefined,
      boxShadow: accent ? 'var(--shadow-glow-sm)' : undefined,
      position: 'relative', overflow: 'hidden',
    }}>
      {accent && <div style={{ position: 'absolute', top: -20, right: -20, width: 80, height: 80, borderRadius: '50%', background: 'oklch(0.62 0.245 27 / 0.15)', filter: 'blur(20px)' }} />}
      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.18em', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: accent ? 'var(--primary)' : 'var(--foreground)', letterSpacing: '-0.03em', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginTop: 6 }}>{sub}</div>}
    </div>
  )
}

export default async function DashboardPage() {
  const supabase = await createClient()

  const [{ data: leads }, { data: stages }, { data: followUps }] = await Promise.all([
    supabase.from('leads').select('id, score, profile, stage_id, created_at, source').eq('is_active', true),
    supabase.from('pipeline_stages').select('id, name, color').order('order_index'),
    supabase.from('follow_ups').select('id, status').eq('status', 'pending'),
  ])

  const total = leads?.length ?? 0
  const hot = leads?.filter(l => (l.score ?? 0) >= 70).length ?? 0
  const warm = leads?.filter(l => (l.score ?? 0) >= 40 && (l.score ?? 0) < 70).length ?? 0
  const pendingFu = followUps?.length ?? 0

  const stageMap = Object.fromEntries((stages ?? []).map(s => [s.id, s]))
  const stageCount = (leads ?? []).reduce<Record<number, number>>((acc, l) => {
    acc[l.stage_id] = (acc[l.stage_id] ?? 0) + 1
    return acc
  }, {})

  const sourceCount = (leads ?? []).reduce<Record<string, number>>((acc, l) => {
    const s = l.source ?? 'outro'
    acc[s] = (acc[s] ?? 0) + 1
    return acc
  }, {})

  const today = new Date().toISOString().split('T')[0]
  const todayLeads = leads?.filter(l => l.created_at.startsWith(today)).length ?? 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <Topbar title="Dashboard Executivo" subtitle="Central de inteligência da DROP AGENCY" cta={{ label: '+ Novo Lead', href: '/crm' }} />

      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }} className="bg-grid">
        {/* Stat Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }} className="animate-fade-up">
          <StatCard label="Total de Leads" value={total} sub={`+${todayLeads} hoje`} />
          <StatCard label="Leads Quentes" value={hot} sub="Score ≥ 70" accent />
          <StatCard label="Leads Mornos" value={warm} sub="Score 40–69" />
          <StatCard label="Follow-ups Pendentes" value={pendingFu} sub="Aguardando envio" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* Pipeline por etapa */}
          <div className="card-premium" style={{ padding: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--foreground)', marginBottom: 16 }}>Pipeline por Etapa</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {(stages ?? []).map(stage => {
                const count = stageCount[stage.id] ?? 0
                const pct = total > 0 ? Math.round((count / total) * 100) : 0
                return (
                  <div key={stage.id}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: stage.color, flexShrink: 0 }} />
                        <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>{stage.name}</span>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--foreground)' }}>{count}</span>
                    </div>
                    <div style={{ height: 3, background: 'oklch(0.27 0.01 17 / 0.4)', borderRadius: 999 }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: stage.color, borderRadius: 999, transition: 'width 0.5s ease' }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Origem dos leads */}
          <div className="card-premium" style={{ padding: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--foreground)', marginBottom: 16 }}>Origem dos Leads</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {Object.entries(sourceCount).sort((a, b) => b[1] - a[1]).map(([source, count]) => (
                <div key={source} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, color: 'var(--muted-foreground)', textTransform: 'capitalize' }}>{source.replace('_', ' ')}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 80, height: 4, background: 'oklch(0.27 0.01 17 / 0.4)', borderRadius: 999 }}>
                      <div style={{ height: '100%', width: `${total > 0 ? (count / total) * 100 : 0}%`, background: 'var(--primary)', borderRadius: 999 }} />
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--foreground)', minWidth: 20, textAlign: 'right' }}>{count}</span>
                  </div>
                </div>
              ))}
              {Object.keys(sourceCount).length === 0 && (
                <p style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>Nenhum lead ainda</p>
              )}
            </div>

            {/* AI Insight */}
            <div style={{
              marginTop: 20, padding: 12, borderRadius: 10,
              background: 'oklch(0.62 0.245 27 / 0.08)',
              border: '1px solid oklch(0.62 0.245 27 / 0.2)',
            }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--primary)', marginBottom: 4 }}>✦ Insight da IA</div>
              <div style={{ fontSize: 11, color: 'var(--muted-foreground)', lineHeight: 1.5 }}>
                {hot > 0
                  ? `${hot} lead${hot > 1 ? 's quentes precisam' : ' quente precisa'} de atenção imediata. Priorize o contato para maximizar conversão.`
                  : 'Nenhum lead quente no momento. Foque em qualificar os leads mornos do pipeline.'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
