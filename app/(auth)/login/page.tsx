'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [role, setRole] = useState<'admin' | 'colaborador'>('colaborador')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const inp: React.CSSProperties = {
    width: '100%', padding: '11px 14px',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 10, color: '#F9FAFB', fontSize: 14,
    outline: 'none', fontFamily: 'Montserrat,sans-serif',
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    const supabase = createClient()
    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password })
    if (authError || !data.user) {
      setError('Email ou senha incorretos.')
      setLoading(false); return
    }
    // Verifica role no user_profiles
    const { data: profile } = await supabase
      .from('user_profiles').select('role,is_active').eq('id', data.user.id).single()
    if (profile && !profile.is_active) {
      await supabase.auth.signOut()
      setError('Sua conta está desativada. Entre em contato com o administrador.')
      setLoading(false); return
    }
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
          name, email, password,
          role: 'colaborador',
          permissions: {
            dashboard: true, crm: true, clientes: true, tarefas: true,
            projetos: true, marketing: false, equipe: false,
            financeiro: false, integracoes: false, configuracoes: false, administracao: false
          }
        })
      })
      const data = await res.json()
      if (data.success) {
        setSuccess('Conta criada com sucesso! Faça login para acessar.')
        setMode('login'); setName(''); setPassword('')
      } else {
        setError(data.error ?? 'Erro ao criar conta. Tente outro e-mail.')
      }
    } finally { setLoading(false) }
  }

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#070707', fontFamily:'Montserrat,sans-serif', position:'relative', overflow:'hidden' }}>

      {/* BG */}
      <div aria-hidden style={{ position:'fixed', inset:0, zIndex:0, pointerEvents:'none' }}>
        <div style={{ position:'absolute', width:'250%', height:'220%', left:'-75%', top:'28%', backgroundImage:`linear-gradient(rgba(229,62,62,0.14) 1px,transparent 1px),linear-gradient(90deg,rgba(229,62,62,0.14) 1px,transparent 1px)`, backgroundSize:'52px 52px', transform:'perspective(650px) rotateX(74deg)', transformOrigin:'50% 0%', WebkitMaskImage:'linear-gradient(to bottom,transparent 0%,rgba(0,0,0,0.6) 25%,black 55%)', maskImage:'linear-gradient(to bottom,transparent 0%,rgba(0,0,0,0.6) 25%,black 55%)' }}/>
        <div style={{ position:'absolute', width:'700px', height:'600px', right:'-100px', top:'-200px', background:'radial-gradient(ellipse at center,rgba(185,14,14,0.45) 0%,transparent 65%)' }}/>
        <div style={{ position:'absolute', width:'500px', height:'400px', left:'-100px', bottom:'-100px', background:'radial-gradient(ellipse at center,rgba(140,8,8,0.2) 0%,transparent 70%)' }}/>
      </div>

      <div style={{ position:'relative', zIndex:1, width:'100%', maxWidth:420, margin:'0 16px' }}>

        {/* Logo */}
        <div style={{ textAlign:'center', marginBottom:28 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="DROP Agency" style={{ width:140, height:'auto', display:'block', margin:'0 auto 14px', filter:'drop-shadow(0 0 24px rgba(229,62,62,0.5))'}}/>
          <div style={{ fontSize:22, fontWeight:800, color:'#F9FAFB', letterSpacing:'-0.02em' }}>DROP Agency</div>
          <div style={{ fontSize:13, color:'#6B7280', marginTop:4 }}>
            {mode==='login' ? 'Acesse o painel de controle' : 'Crie sua conta de colaborador'}
          </div>
        </div>

        {/* Tabs login/cadastro */}
        <div style={{ display:'flex', background:'rgba(255,255,255,0.04)', borderRadius:12, padding:4, marginBottom:20, border:'1px solid rgba(255,255,255,0.07)' }}>
          {(['login','register'] as const).map(m=>(
            <button key={m} onClick={()=>{setMode(m);setError('');setSuccess('')}}
              style={{ flex:1, padding:'9px', borderRadius:9, border:'none', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'Montserrat,sans-serif', transition:'all 0.2s', background:mode===m?'linear-gradient(135deg,#E53E3E,#B91C1C)':'transparent', color:mode===m?'#fff':'#6B7280', boxShadow:mode===m?'0 0 20px rgba(229,62,62,0.3)':'none' }}>
              {m==='login'?'Entrar':'Criar conta'}
            </button>
          ))}
        </div>

        {/* Seletor de acesso (só no login) */}
        {mode==='login'&&(
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:16 }}>
            {(['admin','colaborador'] as const).map(r=>(
              <button key={r} onClick={()=>setRole(r)}
                style={{ padding:'12px', borderRadius:10, border:`1px solid ${role===r?'rgba(229,62,62,0.5)':'rgba(255,255,255,0.08)'}`, background:role===r?'rgba(229,62,62,0.1)':'rgba(255,255,255,0.02)', cursor:'pointer', fontFamily:'Montserrat,sans-serif', transition:'all 0.2s' }}>
                <div style={{ fontSize:18, marginBottom:4 }}>{r==='admin'?'👑':'⚡'}</div>
                <div style={{ fontSize:12, fontWeight:700, color:role===r?'#E53E3E':'#9CA3AF' }}>{r==='admin'?'Administrador':'Colaborador'}</div>
                <div style={{ fontSize:10, color:'#4B5563', marginTop:2 }}>{r==='admin'?'Acesso total':'Acesso limitado'}</div>
              </button>
            ))}
          </div>
        )}

        {/* Card do form */}
        <div style={{ background:'rgba(10,10,10,0.8)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:16, padding:24, backdropFilter:'blur(20px)' }}>
          <form onSubmit={mode==='login'?handleLogin:handleRegister}>
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

              {mode==='register'&&(
                <div>
                  <label style={{ fontSize:10, fontWeight:600, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.1em', display:'block', marginBottom:6 }}>Nome completo</label>
                  <input value={name} onChange={e=>setName(e.target.value)} placeholder="Seu nome completo" required style={inp}
                    onFocus={e=>(e.currentTarget.style.borderColor='rgba(229,62,62,0.5)')}
                    onBlur={e=>(e.currentTarget.style.borderColor='rgba(255,255,255,0.1)')}/>
                </div>
              )}

              <div>
                <label style={{ fontSize:10, fontWeight:600, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.1em', display:'block', marginBottom:6 }}>Email</label>
                <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="seu@email.com" required style={inp}
                  onFocus={e=>(e.currentTarget.style.borderColor='rgba(229,62,62,0.5)')}
                  onBlur={e=>(e.currentTarget.style.borderColor='rgba(255,255,255,0.1)')}/>
              </div>

              <div>
                <label style={{ fontSize:10, fontWeight:600, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.1em', display:'block', marginBottom:6 }}>Senha</label>
                <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder={mode==='register'?'Mínimo 8 caracteres':'••••••••'} required style={inp}
                  onFocus={e=>(e.currentTarget.style.borderColor='rgba(229,62,62,0.5)')}
                  onBlur={e=>(e.currentTarget.style.borderColor='rgba(255,255,255,0.1)')}/>
              </div>

              {error&&<div style={{ background:'rgba(229,62,62,0.08)', border:'1px solid rgba(229,62,62,0.25)', borderRadius:8, padding:'10px 14px', fontSize:13, color:'#FCA5A5' }}>{error}</div>}
              {success&&<div style={{ background:'rgba(16,185,129,0.08)', border:'1px solid rgba(16,185,129,0.25)', borderRadius:8, padding:'10px 14px', fontSize:13, color:'#6EE7B7' }}>{success}</div>}

              <button type="submit" disabled={loading}
                style={{ width:'100%', padding:'13px', borderRadius:10, border:'none', fontSize:14, fontWeight:700, color:'#fff', cursor:loading?'not-allowed':'pointer', background:'linear-gradient(135deg,#E53E3E,#B91C1C)', boxShadow:'0 0 24px rgba(229,62,62,0.35)', opacity:loading?0.7:1, fontFamily:'Montserrat,sans-serif', marginTop:4 }}>
                {loading?(mode==='login'?'Entrando...':'Criando...'):(mode==='login'?`Entrar como ${role==='admin'?'Admin':'Colaborador'}`:'Criar conta')}
              </button>
            </div>
          </form>

          {mode==='register'&&(
            <p style={{ fontSize:11, color:'#4B5563', textAlign:'center', marginTop:14, lineHeight:1.6 }}>
              Contas criadas aqui têm acesso de <strong style={{ color:'#9CA3AF' }}>colaborador</strong>.<br/>
              O admin pode ajustar permissões no painel de Administração.
            </p>
          )}
        </div>

        <p style={{ textAlign:'center', fontSize:11, color:'#374151', marginTop:20 }}>
          DROP AGENCY © 2026 · Ambiente seguro e criptografado
        </p>
      </div>
    </div>
  )
}
