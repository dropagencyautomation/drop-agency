'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const NAV_GROUPS = [
  {
    label: 'Visão Geral',
    items: [{ href: '/dashboard', label: 'Dashboard', icon: GridIcon }],
  },
  {
    label: 'Comercial',
    items: [
      { href: '/crm',   label: 'Pipeline',  icon: KanbanIcon },
      { href: '/leads', label: 'Leads',     icon: UsersIcon },
    ],
  },
  {
    label: 'Operação',
    items: [
      { href: '/followup',  label: 'Follow-up', icon: ClockIcon },
      { href: '/calendario', label: 'Agenda',   icon: CalendarIcon },
    ],
  },
  {
    label: 'Comunicação',
    items: [
      { href: '/whatsapp', label: 'WhatsApp', icon: ChatIcon },
    ],
  },
  {
    label: 'Inteligência',
    items: [
      { href: '/metrics', label: 'Métricas', icon: ChartIcon },
      { href: '/ia',      label: 'IA & Análise', icon: CpuIcon },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { href: '/settings', label: 'Configurações', icon: SlidersIcon },
    ],
  },
]

export default function Sidebar({ userEmail }: { userEmail: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const initials = userEmail.slice(0, 2).toUpperCase()

  return (
    <aside
      style={{ width: 220, background: 'var(--sidebar)', borderRight: '1px solid var(--sidebar-border)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}
    >
      {/* Logo */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--sidebar-border)' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="DROP AGENCY" style={{ width: 172, height: 'auto', display: 'block', filter: 'drop-shadow(0 0 12px rgba(229,62,62,0.4))' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success)', flexShrink: 0 }} />
          <span style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>Sistema operacional</span>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '8px 8px', overflowY: 'auto' }}>
        {NAV_GROUPS.map((group) => (
          <div key={group.label} style={{ marginBottom: 4 }}>
            <div style={{
              fontSize: 9, fontWeight: 600, color: 'var(--muted-foreground)',
              textTransform: 'uppercase', letterSpacing: '0.18em',
              padding: '10px 8px 4px',
            }}>
              {group.label}
            </div>
            {group.items.map((item) => {
              const active = pathname === item.href || (item.href !== '/crm' && pathname.startsWith(item.href))
              const Icon = item.icon
              return (
                <Link key={item.href} href={item.href} style={{ textDecoration: 'none' }}>
                  <div style={{
                    position: 'relative',
                    display: 'flex', alignItems: 'center', gap: 9,
                    padding: '7px 10px', borderRadius: 8, marginBottom: 1,
                    background: active ? 'linear-gradient(to right, oklch(0.62 0.245 27 / 0.15), transparent)' : 'transparent',
                    color: active ? 'var(--foreground)' : 'var(--muted-foreground)',
                    fontSize: 13, fontWeight: active ? 500 : 400,
                    transition: 'all 0.15s ease',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => {
                    if (!active) {
                      (e.currentTarget as HTMLElement).style.background = 'var(--sidebar-accent)'
                      ;(e.currentTarget as HTMLElement).style.color = 'var(--foreground)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!active) {
                      (e.currentTarget as HTMLElement).style.background = 'transparent'
                      ;(e.currentTarget as HTMLElement).style.color = 'var(--muted-foreground)'
                    }
                  }}
                  >
                    {active && (
                      <span style={{
                        position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)',
                        width: 3, height: 20, borderRadius: '0 3px 3px 0',
                        background: 'var(--primary)',
                        boxShadow: '0 0 12px var(--primary)',
                      }} />
                    )}
                    <span style={{ color: active ? 'var(--primary)' : 'inherit', display: 'flex' }}>
                      <Icon size={15} />
                    </span>
                    {item.label}
                  </div>
                </Link>
              )
            })}
          </div>
        ))}

        {/* AI Copilot Widget */}
        <div style={{
          margin: '12px 4px 8px',
          borderRadius: 12,
          border: '1px solid oklch(0.62 0.245 27 / 0.2)',
          background: 'linear-gradient(135deg, oklch(0.62 0.245 27 / 0.1), transparent)',
          padding: 12,
          position: 'relative',
          overflow: 'hidden',
          cursor: 'pointer',
        }}>
          <div style={{
            position: 'absolute', right: -16, top: -16,
            width: 60, height: 60, borderRadius: '50%',
            background: 'oklch(0.62 0.245 27 / 0.25)',
            filter: 'blur(20px)',
          }} />
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--foreground)', marginBottom: 2 }}>✦ IA Copilot</div>
          <div style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>Análise e sugestões em tempo real</div>
        </div>
      </nav>

      {/* User Footer */}
      <div style={{ padding: '10px 8px', borderTop: '1px solid var(--sidebar-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 8 }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
            background: 'var(--gradient-primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 700, color: '#fff',
          }}>{initials}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              Camila Pacheco
            </div>
            <div style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>Admin</div>
          </div>
          <button onClick={handleLogout} title="Sair" style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--muted-foreground)', padding: 4, borderRadius: 4,
            display: 'flex', alignItems: 'center',
          }}>
            <LogoutIcon size={13} />
          </button>
        </div>
      </div>
    </aside>
  )
}

/* ── Icons ─────────────────────────────────────────────── */
function GridIcon({ size = 16 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1"/><rect x="9" y="1.5" width="5.5" height="5.5" rx="1"/><rect x="1.5" y="9" width="5.5" height="5.5" rx="1"/><rect x="9" y="9" width="5.5" height="5.5" rx="1"/></svg>
}
function KanbanIcon({ size = 16 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><rect x="1.5" y="1.5" width="3.5" height="10" rx="1"/><rect x="6.25" y="1.5" width="3.5" height="7" rx="1"/><rect x="11" y="1.5" width="3.5" height="13" rx="1"/></svg>
}
function UsersIcon({ size = 16 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="5.5" r="2.5"/><path d="M1 14c0-2.8 2.2-4.5 5-4.5s5 1.7 5 4.5"/><path d="M13.5 10.5c1 .6 1.5 1.6 1.5 3"/><circle cx="12" cy="4.5" r="2"/></svg>
}
function ClockIcon({ size = 16 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="6.5"/><polyline points="8,4.5 8,8 10.5,10"/></svg>
}
function CalendarIcon({ size = 16 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><rect x="1.5" y="3" width="13" height="11.5" rx="1.5"/><line x1="5" y1="1.5" x2="5" y2="4.5"/><line x1="11" y1="1.5" x2="11" y2="4.5"/><line x1="1.5" y1="7" x2="14.5" y2="7"/></svg>
}
function ChatIcon({ size = 16 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M14 1.5H2A1.5 1.5 0 0 0 .5 3v7A1.5 1.5 0 0 0 2 11.5h3l3 3 3-3h3a1.5 1.5 0 0 0 1.5-1.5V3A1.5 1.5 0 0 0 14 1.5z"/></svg>
}
function ChartIcon({ size = 16 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><line x1="1.5" y1="14.5" x2="14.5" y2="14.5"/><rect x="2" y="8.5" width="3" height="6" rx=".5"/><rect x="6.5" y="5.5" width="3" height="9" rx=".5"/><rect x="11" y="2.5" width="3" height="12" rx=".5"/></svg>
}
function CpuIcon({ size = 16 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><rect x="4.5" y="4.5" width="7" height="7" rx="1"/><line x1="6" y1="4.5" x2="6" y2="2"/><line x1="10" y1="4.5" x2="10" y2="2"/><line x1="6" y1="11.5" x2="6" y2="14"/><line x1="10" y1="11.5" x2="10" y2="14"/><line x1="4.5" y1="6" x2="2" y2="6"/><line x1="4.5" y1="10" x2="2" y2="10"/><line x1="11.5" y1="6" x2="14" y2="6"/><line x1="11.5" y1="10" x2="14" y2="10"/></svg>
}
function SlidersIcon({ size = 16 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><line x1="1.5" y1="4" x2="14.5" y2="4"/><line x1="1.5" y1="8" x2="14.5" y2="8"/><line x1="1.5" y1="12" x2="14.5" y2="12"/><circle cx="5" cy="4" r="1.5"/><circle cx="10" cy="8" r="1.5"/><circle cx="6.5" cy="12" r="1.5"/></svg>
}
function LogoutIcon({ size = 16 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M6 14H3a1.5 1.5 0 0 1-1.5-1.5v-9A1.5 1.5 0 0 1 3 2h3"/><polyline points="10.5,11 14,8 10.5,5"/><line x1="14" y1="8" x2="6" y2="8"/></svg>
}
