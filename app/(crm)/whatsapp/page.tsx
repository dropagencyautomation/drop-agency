import Topbar from '@/components/layout/Topbar'

export default function WhatsAppPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Topbar title="WhatsApp" subtitle="Central de atendimento e conversas" />
      <div style={{ padding: 24 }}>
        <p style={{ color: 'var(--muted-foreground)', fontSize: 13 }}>Em breve — chat com leads, agente IA e envio manual.</p>
      </div>
    </div>
  )
}
