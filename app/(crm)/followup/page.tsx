import Topbar from '@/components/layout/Topbar'

export default function FollowupPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Topbar title="Follow-up" subtitle="Cadências e acompanhamento de leads" cta={{ label: '+ Follow-up' }} />
      <div style={{ padding: 24 }}>
        <p style={{ color: 'var(--muted-foreground)', fontSize: 13 }}>Em breve — cadências automáticas e acompanhamento.</p>
      </div>
    </div>
  )
}
