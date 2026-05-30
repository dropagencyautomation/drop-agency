import Topbar from '@/components/layout/Topbar'

export default function IaPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Topbar title="IA & Análise" subtitle="Inteligência artificial aplicada aos leads" />
      <div style={{ padding: 24 }}>
        <p style={{ color: 'var(--muted-foreground)', fontSize: 13 }}>Em breve — análise de leads, sugestões e insights automáticos.</p>
      </div>
    </div>
  )
}
