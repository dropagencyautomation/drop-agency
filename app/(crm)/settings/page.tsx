import Topbar from '@/components/layout/Topbar'

export default function SettingsPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Topbar title="Configurações" subtitle="Configurações da plataforma DROP AGENCY" />
      <div style={{ padding: 24 }}>
        <p style={{ color: 'var(--muted-foreground)', fontSize: 13 }}>Em breve — perfil, integrações e preferências do sistema.</p>
      </div>
    </div>
  )
}
