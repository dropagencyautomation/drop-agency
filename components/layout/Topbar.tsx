'use client'

import { useState } from 'react'
import Link from 'next/link'

interface TopbarProps {
  title: string
  subtitle: string
  cta?: { label: string; href?: string; onClick?: () => void }
}

export default function Topbar({ title, subtitle, cta }: TopbarProps) {
  const [search, setSearch] = useState('')

  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 30,
      borderBottom: '1px solid var(--border)',
      background: 'oklch(0.12 0 0 / 0.85)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      padding: '0 24px',
      height: 60,
      display: 'flex', alignItems: 'center', gap: 16,
      flexShrink: 0,
    }}>
      {/* Title */}
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--foreground)', letterSpacing: '-0.02em' }}>{title}</div>
        <div style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>{subtitle}</div>
      </div>

      {/* Search */}
      <div style={{ position: 'relative' }}>
        <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted-foreground)' }}
          width={13} height={13} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
          <circle cx="7" cy="7" r="5"/><line x1="11" y1="11" x2="14.5" y2="14.5"/>
        </svg>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar lead..."
          style={{
            paddingLeft: 30, paddingRight: 12, paddingTop: 7, paddingBottom: 7,
            background: 'oklch(0.16 0.003 17 / 0.6)',
            border: '1px solid var(--border)',
            borderRadius: 8, fontSize: 12,
            color: 'var(--foreground)', outline: 'none',
            width: 200,
            transition: 'border-color 0.2s',
          }}
          onFocus={e => (e.target.style.borderColor = 'oklch(0.62 0.245 27 / 0.6)')}
          onBlur={e => (e.target.style.borderColor = 'var(--border)')}
        />
      </div>

      {/* CTA */}
      {cta && (
        cta.href ? (
          <Link href={cta.href} style={{ textDecoration: 'none' }}>
            <button className="btn-glow" style={{
              padding: '7px 16px', borderRadius: 8, border: 'none',
              fontSize: 12, fontWeight: 600, color: '#fff', cursor: 'pointer',
            }}>
              {cta.label}
            </button>
          </Link>
        ) : (
          <button className="btn-glow" onClick={cta.onClick} style={{
            padding: '7px 16px', borderRadius: 8, border: 'none',
            fontSize: 12, fontWeight: 600, color: '#fff', cursor: 'pointer',
          }}>
            {cta.label}
          </button>
        )
      )}
    </header>
  )
}
