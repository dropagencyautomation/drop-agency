import Topbar from '@/components/layout/Topbar'

export default function CalendarioPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Topbar title="Agenda" subtitle="Reuniões e compromissos" />
      <div style={{ padding: 24 }}>
        <p style={{ color: 'var(--muted-foreground)', fontSize: 13 }}>Em breve — integração com Google Calendar.</p>
      </div>
    </div>
  )
}
