import Topbar from '@/components/layout/Topbar'

export default function MetricsPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Topbar title="Métricas" subtitle="Dashboards e análises de performance" cta={{ label: 'Exportar' }} />
      <div style={{ padding: 24 }}>
        <p style={{ color: 'var(--muted-foreground)', fontSize: 13 }}>Em breve — métricas de conversão, receita e performance.</p>
      </div>
    </div>
  )
}
