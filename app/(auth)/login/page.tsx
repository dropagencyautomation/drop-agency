'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const inp: React.CSSProperties = {
    width: '100%', padding: '11px 14px', background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: '#F9FAFB',
    fontSize: 14, outline: 'none', fontFamily: 'Montserrat, sans-serif',
    transition: 'border-color 0.2s',
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError('Email ou senha incorretos.'); setLoading(false); return }
    router.push('/crm')
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Informe seu nome.'); return }
    if (password.length < 8) { setError('Senha deve ter pelo menos 8 caracteres.'); return }
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, email, password, role: 'colaborador',
          permissions: { dashboard: true, crm: true, clientes: true, tarefas: true, projetos: true, marketing: false, equipe: false, financeiro: false, integracoes: false, configuracoes: false, administracao: false }
        })
      })
      const data = await res.json()
      if (data.success) {
        setSuccess('Conta criada! Aguarde aprovação do administrador ou faça login.')
        setMode('login'); setName(''); setPassword('')
      } else {
        setError(data.error ?? 'Erro ao criar conta.')
      }
    } finally { setLoading(false) }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#070707', fontFamily: 'Montserrat, sans-serif', position: 'relative', overflow: 'hidden' }}>

      {/* Background 3D grid */}
      <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', width: '250%', height: '220%', left: '-75%', top: '28%', backgroundImage: `linear-gradient(rgba(229,62,62,0.14) 1px,transparent 1px),linear-gradient(90deg,rgba(229,62,62,0.14) 1px,transparent 1px)`, backgroundSize: '52px 52px', transform: 'perspective(650px) rotateX(74deg)', transformOrigin: '50% 0%', WebkitMaskImage: 'linear-gradient(to bottom,transparent 0%,rgba(0,0,0,0.6) 25%,black 55%)', maskImage: 'linear-gradient(to bottom,transparent 0%,rgba(0,0,0,0.6) 25%,black 55%)' }} />
        <div style={{ position: 'absolute', width: '700px', height: '600px', right: '-100px', top: '-200px', background: 'radial-gradient(ellipse at center,rgba(185,14,14,0.45) 0%,transparent 65%)' }} />
        <div style={{ position: 'absolute', width: '500px', height: '400px', left: '-100px', bottom: '-100px', background: 'radial-gradient(ellipse at center,rgba(140,8,8,0.2) 0%,transparent 70%)' }} />
      </div>

      {/* Card */}
      <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 420, margin: '0 16px' }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, overflow: 'hidden', margin: '0 auto 14px', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 0 30px rgba(229,62,62,0.4)' }}>
            <div style={{ width: '100%', height: '100%', backgroundImage: 'url(/logo.png)', backgroundSize: '290%', backgroundPosition: '52% 26%', backgroundRepeat: 'no-repeat' }} />
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#F9FAFB', letterSpacing: '-0.02em' }}>DROP Agency</div>
          <div style={{ fontSize: 13, color: '#6B7280', marginTop: 4 }}>
            {mode === 'login' ? 'Entre na sua conta' : 'Crie sua conta de acesso'}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 4, marginBottom: 24, border: '1px solid rgba(255,255,255,0.08)' }}>
          {(['login', 'register'] as const).map(m => (
            <button key={m} onClick={() => { setMode(m); setError(''); setSuccess('') }}
              style={{ flex: 1, padding: '9px', borderRadius: 9, border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Montserrat,sans-serif', transition: 'all 0.2s', background: mode === m ? 'linear-gradient(135deg,#E53E3E,#B91C1C)' : 'transparent', color: mode === m ? '#fff' : '#6B7280', boxShadow: mode === m ? '0 0 20px rgba(229,62,62,0.3)' : 'none' }}>
              {m === 'login' ? 'Entrar' : 'Criar conta'}
            </button>
          ))}
        </div>

        {/* Form card */}
        <div style={{ background: 'rgba(10,10,10,0.8)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 28, backdropFilter: 'blur(20px)' }}>
          <form onSubmit={mode === 'login' ? handleLogin : handleRegister}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {mode === 'register' && (
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.1em', display: 'block', marginBottom: 6 }}>Nome completo</label>
                  <input value={name} onChange={e => setName(e.target.value)} placeholder="Seu nome" required style={inp}
                    onFocus={e => (e.currentTarget.style.borderColor = 'rgba(229,62,62,0.5)')}
                    onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)')} />
                </div>
              )}

              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.1em', display: 'block', marginBottom: 6 }}>Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="seu@email.com" required style={inp}
                  onFocus={e => (e.currentTarget.style.borderColor = 'rgba(229,62,62,0.5)')}
                  onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)')} />
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.1em', display: 'block', marginBottom: 6 }}>Senha</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={mode === 'register' ? 'Mínimo 8 caracteres' : '••••••••'} required style={inp}
                  onFocus={e => (e.currentTarget.style.borderColor = 'rgba(229,62,62,0.5)')}
                  onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)')} />
              </div>

              {error && (
                <div style={{ background: 'rgba(229,62,62,0.1)', border: '1px solid rgba(229,62,62,0.3)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#FCA5A5' }}>
                  {error}
                </div>
              )}

              {success && (
                <div style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#6EE7B7' }}>
                  {success}
                </div>
              )}

              <button type="submit" disabled={loading}
                style={{ width: '100%', padding: '13px', borderRadius: 10, border: 'none', fontSize: 14, fontWeight: 700, color: '#fff', cursor: loading ? 'not-allowed' : 'pointer', background: 'linear-gradient(135deg,#E53E3E,#B91C1C)', boxShadow: '0 0 24px rgba(229,62,62,0.4)', opacity: loading ? 0.7 : 1, fontFamily: 'Montserrat,sans-serif', transition: 'opacity 0.2s', marginTop: 4 }}>
                {loading ? (mode === 'login' ? 'Entrando...' : 'Criando conta...') : (mode === 'login' ? 'Entrar' : 'Criar conta')}
              </button>
            </div>
          </form>

          {mode === 'register' && (
            <p style={{ fontSize: 11, color: '#4B5563', textAlign: 'center', marginTop: 16, lineHeight: 1.5 }}>
              Contas criadas aqui têm acesso de <strong style={{ color: '#9CA3AF' }}>colaborador</strong>.<br />
              O administrador pode ajustar as permissões no painel.
            </p>
          )}
        </div>

        <p style={{ textAlign: 'center', fontSize: 11, color: '#374151', marginTop: 20 }}>
          DROP AGENCY © 2026 · Ambiente seguro
        </p>
      </div>
    </div>
  )
}
