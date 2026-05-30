'use client'
import React, { useState, useEffect, useRef, useMemo } from 'react'
import { createBrowserClient } from '@supabase/ssr'

const sb = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface Stage { id:number; name:string; color:string; order_index:number; kanban:string }
interface Lead  { id:string; name:string; phone:string; email:string|null; company_name:string|null; niche:string|null; revenue_range:string|null; service_type:string|null; desired_service:string|null; profile:string|null; score:number; stage_id:number; source:string|null; created_at:string; updated_at:string; last_interaction_at:string|null; is_active:boolean; estimated_budget:string|null; main_pains:string|null; urgency:string|null }
interface Interaction { id:string; lead_id:string; channel:string; direction:string; content:string; ai_generated:boolean; created_at:string }
interface AiConv { id:string; lead_id:string; whatsapp_number:string; conversation_history:Array<{role:string;content:string;timestamp:string}>; current_step:string; human_takeover:boolean }
interface FollowUp { id:string; lead_id:string; follow_up_day:number|null; scheduled_at:string; status:string; content:string|null; reason:string|null; responsible:string|null; next_contact_at:string|null; notes:Array<{text:string;timestamp:string;author:string}>; created_at:string }
interface TeamMember { id:string; name:string; email:string|null; role:string; avatar_color:string; is_active:boolean }
interface MemberXP { id:string; member_id:string; total_xp:number; level:number; tasks_done:number }
interface Badge { id:number; name:string; description:string; icon:string; required_xp:number; required_tasks:number }
interface MemberBadge { id:string; member_id:string; badge_id:number; earned_at:string }
interface Project { id:string; lead_id:string|null; name:string; description:string|null; client_name:string|null; status:string; start_date:string|null; end_date:string|null; budget:number|null; color:string; created_at:string }
interface ProjectMember { project_id:string; member_id:string; role:string|null }
interface ProjectTask { id:string; project_id:string; assigned_to:string|null; title:string; description:string|null; status:string; priority:string; xp_reward:number; due_date:string|null; completed_at:string|null; created_at:string }
interface Campaign { id:string; project_id:string|null; client_name:string; platform:string; campaign_name:string; status:string; budget:number; spend:number; impressions:number; clicks:number; leads_gen:number; conversions:number; revenue:number; period_start:string|null; period_end:string|null }
interface Task { id:string; title:string; description:string|null; lead_id:string|null; project_id:string|null; created_by:string|null; status:string; priority:string; start_date:string|null; due_date:string|null; completed_at:string|null; xp_reward:number; notes:string|null; created_at:string; updated_at:string }
interface TaskAssignee { task_id:string; member_id:string }
interface UserProfile { id:string; name:string; email:string|null; role:string; member_id:string|null; permissions:Record<string,boolean>; is_active:boolean; last_login_at:string|null; avatar_url:string|null; created_at:string }
interface AuditEntry { id:string; user_id:string|null; user_name:string|null; action:string; resource:string; resource_id:string|null; details:Record<string,unknown>; created_at:string }
interface Notif { id:string; recipient_id:string; actor_name:string|null; title:string; message:string; type:string; resource:string|null; resource_id:string|null; read:boolean; created_at:string }

const fmtDate = (d:string) => new Date(d).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})
const fmtDateShort = (d:string) => new Date(d).toLocaleDateString('pt-BR')
const timeAgo = (d:string) => { const m=Math.floor((Date.now()-new Date(d).getTime())/60000); if(m<1)return'agora'; if(m<60)return`${m}min`; if(m<1440)return`${Math.floor(m/60)}h`; return`${Math.floor(m/1440)}d` }
const initials = (name:string|null,phone:string) => { if(name) return name.split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase(); return phone.slice(-4,-2).toUpperCase() }
const scoreColor = (s:number) => s>=70?'#E53E3E':s>=40?'#F59E0B':'#6B7280'
const profileLabel: Record<string,string> = { quente:'Quente',estrategico:'Estratégico',recorrente:'Recorrente',pontual:'Pontual',sem_timing:'Sem timing',curioso:'Curioso',sem_orcamento:'Sem orçamento' }
const profileColor: Record<string,string> = { quente:'#E53E3E',estrategico:'#E53E3E',recorrente:'#10B981',pontual:'#3B82F6',sem_timing:'#F59E0B',curioso:'#6B7280',sem_orcamento:'#EF4444' }
const sourceLabel: Record<string,string> = { whatsapp:'WhatsApp',instagram:'Instagram',indicacao:'Indicação',networking:'Networking',meta_ads:'Meta Ads',google_ads:'Google Ads',outro:'Outro' }

const KANBAN_LABELS: Record<string,string> = { aquisicao:'Aquisição', vendas:'Vendas', operacao:'Operação' }

// Sistema de Níveis DROP Agency
const LEVELS = [
  { n:1, name:'Recruta',               xp:0     },
  { n:2, name:'Operador',              xp:500   },
  { n:3, name:'Navegador',             xp:1500  },
  { n:4, name:'Especialista',          xp:3000  },
  { n:5, name:'Comandante',            xp:5000  },
  { n:6, name:'Capitão de Missão',     xp:8000  },
  { n:7, name:'Estrategista Orbital',  xp:12000 },
  { n:8, name:'Diretor de Operações',  xp:18000 },
  { n:9, name:'Mestre de Missões',     xp:25000 },
  { n:10,name:'Lenda Drop',            xp:35000 },
]
const xpForLevel = (xp:number) => { const i=LEVELS.slice().reverse().findIndex(l=>xp>=l.xp); return i===-1?1:LEVELS[LEVELS.length-1-i].n }
const xpLevelName = (xp:number) => { const l=LEVELS.slice().reverse().find(l=>xp>=l.xp); return l?.name??'Recruta' }
const xpNextLevel = (xp:number) => { const cur=xpForLevel(xp); return LEVELS[cur]?.xp??35000 }
const xpProgress = (xp:number) => { const cur=xpForLevel(xp); const base=LEVELS[cur-1]?.xp??0; const next=LEVELS[cur]?.xp??35000; return Math.min(100,Math.round(((xp-base)/(next-base))*100)) }
// XP por prioridade de tarefa
const priorityXP: Record<string,number> = { low:10, medium:25, high:50, urgent:100 }
// Bonus XP
const XP_BONUS = { client_satisfied:50, deadline_met:15, early_delivery:30, helped_colleague:20, monthly_goal:100, quarterly_goal:300 }
// Penalidades
const XP_PENALTY = { overdue:-10, missed_meeting:-30, rework:-20 }
// Produtividade score
const productivityScore = (done:number,total:number,overdue:number) => {
  if(total===0) return 0
  const base = Math.round((done/total)*100)
  const penalty = Math.round((overdue/Math.max(1,total))*20)
  return Math.max(0, Math.min(100, base - penalty))
}
const prodLabel = (score:number) => score<=40?'Crítico':score<=60?'Regular':score<=80?'Bom':score<=90?'Excelente':'Elite Drop'
const prodColor = (score:number) => score<=40?'#EF4444':score<=60?'#F59E0B':score<=80?'#3B82F6':score<=90?'#10B981':'#E53E3E'
const priorityColor: Record<string,string> = { low:'#6B7280', medium:'#3B82F6', high:'#F59E0B', urgent:'#E53E3E' }
const priorityLabel: Record<string,string> = { low:'Baixa', medium:'Média', high:'Alta', urgent:'Urgente' }
const platformColor: Record<string,string> = { meta_ads:'#1877F2', google_ads:'#EA4335', tiktok_ads:'#000', linkedin_ads:'#0A66C2', other:'#6B7280' }
const platformLabel: Record<string,string> = { meta_ads:'Meta Ads', google_ads:'Google Ads', tiktok_ads:'TikTok Ads', linkedin_ads:'LinkedIn Ads', other:'Outro' }
const platformIcon: Record<string,string> = { meta_ads:'f', google_ads:'G', tiktok_ads:'T', linkedin_ads:'in', other:'?' }

const ALL_MODULES = ['dashboard','crm','clientes','tarefas','projetos','marketing','equipe','financeiro','integracoes','configuracoes','administracao'] as const
const MODULE_LABELS: Record<string,string> = { dashboard:'Dashboard',crm:'CRM',clientes:'Clientes',tarefas:'Tarefas',projetos:'Projetos',marketing:'Marketing',equipe:'Equipe',financeiro:'Financeiro',integracoes:'Integrações',configuracoes:'Configurações',administracao:'Administração' }

const NAV = [
  { id:'dashboard',     label:'Dashboard' },
  { id:'aquisicao',     label:'Aquisição' },
  { id:'vendas',        label:'Vendas' },
  { id:'operacao',      label:'Operação' },
  { id:'followup',      label:'Follow-up' },
  { id:'tarefas',       label:'Tarefas' },
  { id:'projetos',      label:'Projetos' },
  { id:'marketing',     label:'Marketing' },
  { id:'equipe',        label:'Equipe' },
  { id:'financeiro',    label:'Financeiro' },
  { id:'integracoes',   label:'Integrações' },
  { id:'configuracoes', label:'Configurações' },
  { id:'administracao', label:'Administração' },
]

const NAV_ICONS: Record<string,React.ReactNode> = {
  dashboard:     <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><rect x="1" y="1" width="6" height="6" rx="1.5" fill="currentColor" opacity=".8"/><rect x="9" y="1" width="6" height="6" rx="1.5" fill="currentColor" opacity=".8"/><rect x="1" y="9" width="6" height="6" rx="1.5" fill="currentColor" opacity=".8"/><rect x="9" y="9" width="6" height="6" rx="1.5" fill="currentColor" opacity=".8"/></svg>,
  aquisicao:     <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M2 13h3V6H2zM6.5 13h3V3h-3zM11 13h3V9h-3z" fill="currentColor" opacity=".8"/></svg>,
  vendas:        <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.5" opacity=".8"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity=".5"/></svg>,
  operacao:      <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><rect x="1" y="2" width="14" height="4" rx="1.5" fill="currentColor" opacity=".8"/><rect x="1" y="10" width="14" height="4" rx="1.5" fill="currentColor" opacity=".5"/></svg>,
  followup:      <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" opacity=".8"/><path d="M8 4.5V8l2.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity=".8"/></svg>,
  financeiro:    <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M8 1v14M4 4.5C4 3.12 5.34 2 7 2h2c1.66 0 3 1.12 3 2.5S10.66 7 9 7H7C5.34 7 4 8.12 4 9.5S5.34 12 7 12h2c1.66 0 3-1.12 3-2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity=".8"/></svg>,
  integracoes:   <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><circle cx="3.5" cy="8" r="2" fill="currentColor" opacity=".8"/><circle cx="12.5" cy="3.5" r="2" fill="currentColor" opacity=".8"/><circle cx="12.5" cy="12.5" r="2" fill="currentColor" opacity=".8"/><path d="M5.5 8h3l1.5-3.5M8.5 8l1.5 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" opacity=".8"/></svg>,
  configuracoes: <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.5" opacity=".8"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.42 1.42M11.53 11.53l1.42 1.42M11.53 4.47l1.42-1.42M3.05 12.95l1.42-1.42" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity=".6"/></svg>,
  projetos:      <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><rect x="1" y="3" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" opacity=".8"/><path d="M5 7h6M5 10h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" opacity=".7"/></svg>,
  marketing:     <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M2 12L6 7l3 3 2-4 3 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity=".8"/></svg>,
  equipe:        <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><circle cx="6" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.4" opacity=".8"/><circle cx="11" cy="5" r="2" stroke="currentColor" strokeWidth="1.2" opacity=".5"/><path d="M1 13c0-2.2 2.24-4 5-4s5 1.8 5 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity=".8"/><path d="M11 9c1.5 0 3 .9 3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity=".5"/></svg>,
  tarefas:       <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M2 4h12M2 8h8M2 12h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity=".8"/><circle cx="13" cy="11" r="2.5" stroke="currentColor" strokeWidth="1.3" opacity=".8"/><path d="M12 11l.7.7 1.3-1.3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity=".8"/></svg>,
  administracao: <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M8 1L9.5 5h4l-3.25 2.5 1.25 4L8 9l-3.5 2.5 1.25-4L2.5 5h4z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" opacity=".8"/></svg>,
}

function AreaChart({ data, color='#E53E3E', height=80, id='c' }: { data:number[], color?:string, height?:number, id?:string }) {
  if (data.length < 2) return <div style={{height}}/>
  const max=Math.max(...data), min=Math.min(...data), range=max-min||1
  const W=300, H=height
  const pts = data.map((v,i)=>({ x:(i/(data.length-1))*W, y:H-((v-min)/range)*(H-12)-6 }))
  const line = pts.map((p,i)=>`${i===0?'M':'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('')
  const area = `${line}L${W},${H}L0,${H}Z`
  const gid = `ag-${id}`
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{width:'100%',height,display:'block'}} preserveAspectRatio="none">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25"/>
          <stop offset="100%" stopColor={color} stopOpacity="0.02"/>
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`}/>
      <path d={line} stroke={color} strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function MiniBarChart({ color='#E53E3E' }: { color?:string }) {
  const bars=[40,65,50,80,60,90,70]
  return (
    <svg width="28" height="18" viewBox="0 0 28 18">
      {bars.map((h,i)=><rect key={i} x={i*4} y={18-h*0.16} width="3" height={h*0.16} rx="0.5" fill={color} opacity={i===bars.length-1?1:0.4}/>)}
    </svg>
  )
}

function KpiCard({ label, value, trend, trendSuffix='%', wide=false }: { label:string, value:string|number, trend:number, trendSuffix?:string, wide?:boolean }) {
  const up = trend >= 0
  return (
    <div style={{background:'rgba(10,10,10,0.75)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:12,padding:'18px 20px',backdropFilter:'blur(12px)',transition:'border-color 0.2s'}}
      onMouseEnter={e=>(e.currentTarget.style.borderColor='rgba(229,62,62,0.3)')}
      onMouseLeave={e=>(e.currentTarget.style.borderColor='rgba(255,255,255,0.07)')}
    >
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
        <span style={{fontSize:10,fontWeight:600,color:'#6B7280',textTransform:'uppercase',letterSpacing:'0.12em'}}>{label}</span>
        <MiniBarChart/>
      </div>
      <div style={{fontSize:wide?20:26,fontWeight:800,color:'#F9FAFB',letterSpacing:'-0.03em',lineHeight:1}}>{value}</div>
      <div style={{display:'flex',alignItems:'center',gap:4,marginTop:6}}>
        <span style={{fontSize:11,color:up?'#10B981':'#EF4444',fontWeight:500}}>{up?'↑':'↓'} {Math.abs(trend).toFixed(1)}{trendSuffix}</span>
        <span style={{fontSize:10,color:'#374151'}}>vs mês anterior</span>
      </div>
    </div>
  )
}

function Toast({ msg, onClose }: { msg:string, onClose:()=>void }) {
  useEffect(()=>{ const t=setTimeout(onClose,4000); return ()=>clearTimeout(t) },[])
  return (
    <div style={{position:'fixed',bottom:24,right:24,zIndex:200,background:'#111',border:'1px solid rgba(229,62,62,0.4)',borderRadius:12,padding:'12px 18px',color:'#F9FAFB',fontSize:13,fontWeight:500,boxShadow:'0 0 30px rgba(229,62,62,0.2)',display:'flex',alignItems:'center',gap:10,fontFamily:'Montserrat,sans-serif'}}>
      <span style={{color:'#E53E3E',fontSize:16}}>✦</span> {msg}
      <button onClick={onClose} style={{marginLeft:8,background:'none',border:'none',color:'#6B7280',cursor:'pointer',fontSize:14}}>×</button>
    </div>
  )
}

export default function DropCRM() {
  const [panel,setPanel] = useState('dashboard')
  const [stages,setStages] = useState<Stage[]>([])
  const [leads,setLeads] = useState<Lead[]>([])
  const [followUps,setFollowUps] = useState<FollowUp[]>([])
  const [interactions,setInteractions] = useState<Interaction[]>([])
  const [aiConvs,setAiConvs] = useState<AiConv[]>([])
  const [search,setSearch] = useState('')
  const [dragOver,setDragOver] = useState<number|null>(null)
  const [addLeadModal,setAddLeadModal] = useState(false)
  const [detailLead,setDetailLead] = useState<Lead|null>(null)
  const [chatLead,setChatLead] = useState<Lead|null>(null)
  const [toast,setToast] = useState<string|null>(null)
  const [fuModal,setFuModal] = useState<{leadId:string}|null>(null)
  const [fuDetail,setFuDetail] = useState<FollowUp|null>(null)
  const [fuNote,setFuNote] = useState('')
  const [replyText,setReplyText] = useState('')
  const [sending,setSending] = useState(false)
  const [newLead,setNewLead] = useState({ name:'',phone:'',email:'',company_name:'',niche:'',source:'whatsapp',service_type:'recorrente',desired_service:'',estimated_budget:'',urgency:'curto_prazo',profile:'curioso' })
  const [newFu,setNewFu] = useState({ reason:'',responsible:'Camila Pacheco',next_contact_at:'',content:'' })
  const msgsRef = useRef<HTMLDivElement>(null)
  // Novos painéis
  const [members,setMembers] = useState<TeamMember[]>([])
  const [memberXP,setMemberXP] = useState<MemberXP[]>([])
  const [badges,setBadges] = useState<Badge[]>([])
  const [memberBadges,setMemberBadges] = useState<MemberBadge[]>([])
  const [projects,setProjects] = useState<Project[]>([])
  const [projectMembers,setProjectMembers] = useState<ProjectMember[]>([])
  const [tasks,setTasks] = useState<ProjectTask[]>([])
  const [campaigns,setCampaigns] = useState<Campaign[]>([])
  const [equipeTab,setEquipeTab] = useState<'membros'|'produtividade'|'xp'|'organograma'>('membros')
  const [orgAccessModal,setOrgAccessModal] = useState<TeamMember|null>(null)
  const [orgAccessForm,setOrgAccessForm] = useState({email:'',password:'',confirmPassword:''})
  const [orgAccessSaving,setOrgAccessSaving] = useState(false)
  const [selectedProject,setSelectedProject] = useState<Project|null>(null)
  const [addProjectModal,setAddProjectModal] = useState(false)
  const [addTaskModal,setAddTaskModal] = useState<{projectId:string}|null>(null)
  const [addCampaignModal,setAddCampaignModal] = useState(false)
  const [addMemberModal,setAddMemberModal] = useState(false)
  const [newProject,setNewProject] = useState({name:'',client_name:'',description:'',budget:'',start_date:'',end_date:'',color:'#E53E3E'})
  const [newTask,setNewTask] = useState({title:'',description:'',assigned_to:'',priority:'medium',due_date:''})
  const [newCampaign,setNewCampaign] = useState({client_name:'',campaign_name:'',platform:'meta_ads',budget:'',spend:'',impressions:'',clicks:'',leads_gen:'',conversions:'',revenue:'',period_start:'',period_end:''})
  const [newMember,setNewMember] = useState({name:'',email:'',role:'',avatar_color:'#E53E3E'})
  // Tarefas standalone
  const [standaloneTasks,setStandaloneTasks] = useState<Task[]>([])
  const [taskAssignees,setTaskAssignees] = useState<TaskAssignee[]>([])
  const [taskView,setTaskView] = useState<'dashboard'|'kanban'|'lista'>('dashboard')
  const [taskPeriod,setTaskPeriod] = useState<'today'|'week'|'month'|'quarter'|'semester'|'year'>('month')
  const [addTaskStandaloneModal,setAddTaskStandaloneModal] = useState(false)
  const [newStandaloneTask,setNewStandaloneTask] = useState({title:'',description:'',lead_id:'',priority:'medium',start_date:'',due_date:'',notes:'',assignees:[] as string[]})
  // Usuários / Admin
  const [userProfiles,setUserProfiles] = useState<UserProfile[]>([])
  const [currentUser,setCurrentUser] = useState<UserProfile|null>(null)
  const [auditLogs,setAuditLogs] = useState<AuditEntry[]>([])
  const [adminTab,setAdminTab] = useState<'usuarios'|'permissoes'|'auditoria'>('usuarios')
  const [createUserModal,setCreateUserModal] = useState(false)
  const [editPermUser,setEditPermUser] = useState<UserProfile|null>(null)
  const [newUser,setNewUser] = useState({name:'',email:'',password:'',role:'colaborador',member_id:'',permissions:{dashboard:true,crm:true,clientes:true,tarefas:true,projetos:false,marketing:false,equipe:false,financeiro:false,integracoes:false,configuracoes:false,administracao:false}})
  const [savingUser,setSavingUser] = useState(false)
  // Notificações + Perfil
  const [notifs,setNotifs] = useState<Notif[]>([])
  const [notifOpen,setNotifOpen] = useState(false)
  const [profileMenuOpen,setProfileMenuOpen] = useState(false)
  const [profileModal,setProfileModal] = useState(false)
  const [uploadingAvatar,setUploadingAvatar] = useState(false)
  const [editName,setEditName] = useState('')
  const avatarInputRef = useRef<HTMLInputElement>(null)

  async function fetchAll() {
    const [s,l,f,i,a,mb,mx,bg,mbg,pr,pm,tk,cp] = await Promise.all([
      sb.from('pipeline_stages').select('*').order('order_index'),
      sb.from('leads').select('*').eq('is_active',true).order('updated_at',{ascending:false}),
      sb.from('follow_ups').select('*').order('created_at',{ascending:false}),
      sb.from('interactions').select('*').order('created_at',{ascending:false}).limit(300),
      sb.from('ai_conversations').select('*'),
      sb.from('team_members').select('*').eq('is_active',true).order('name'),
      sb.from('member_xp').select('*'),
      sb.from('badges').select('*').order('required_xp'),
      sb.from('member_badges').select('*'),
      sb.from('projects').select('*').order('created_at',{ascending:false}),
      sb.from('project_members').select('*'),
      sb.from('project_tasks').select('*').order('created_at',{ascending:false}),
      sb.from('marketing_campaigns').select('*').order('created_at',{ascending:false}),
    ])
    if(s.data) setStages(s.data)
    if(l.data) setLeads(l.data)
    if(f.data) setFollowUps(f.data)
    if(i.data) setInteractions(i.data)
    if(a.data) setAiConvs(a.data)
    if(mb.data) setMembers(mb.data)
    if(mx.data) setMemberXP(mx.data)
    if(bg.data) setBadges(bg.data)
    if(mbg.data) setMemberBadges(mbg.data)
    if(pr.data) setProjects(pr.data)
    if(pm.data) setProjectMembers(pm.data)
    if(tk.data) setTasks(tk.data)
    if(cp.data) setCampaigns(cp.data)
    const [tk2,ta,up,al] = await Promise.all([
      sb.from('tasks').select('*').order('created_at',{ascending:false}),
      sb.from('task_assignees').select('*'),
      sb.from('user_profiles').select('*').order('created_at'),
      sb.from('audit_log').select('*').order('created_at',{ascending:false}).limit(50),
    ])
    if(tk2.data) setStandaloneTasks(tk2.data)
    if(ta.data) setTaskAssignees(ta.data)
    if(up.data) setUserProfiles(up.data)
    if(al.data) setAuditLogs(al.data)
    // Notificações do usuário atual
    const {data:{user}} = await sb.auth.getUser()
    if(user) {
      const {data:nf} = await sb.from('notifications').select('*').eq('recipient_id',user.id).order('created_at',{ascending:false}).limit(30)
      if(nf) setNotifs(nf)
    }
  }

  async function completeTask(task: ProjectTask) {
    const now = new Date().toISOString()
    await sb.from('project_tasks').update({status:'done',completed_at:now}).eq('id',task.id)
    if(task.assigned_to) {
      const xp = priorityXP[task.priority]??20
      await sb.from('xp_transactions').insert({member_id:task.assigned_to,points:xp,reason:`Tarefa concluída: ${task.title}`,task_id:task.id})
      const cur = memberXP.find(x=>x.member_id===task.assigned_to)
      const newTotal = (cur?.total_xp??0)+xp
      const newDone = (cur?.tasks_done??0)+1
      await sb.from('member_xp').update({total_xp:newTotal,tasks_done:newDone,updated_at:now}).eq('member_id',task.assigned_to)
      // check badges
      const earnedIds = memberBadges.filter(b=>b.member_id===task.assigned_to).map(b=>b.badge_id)
      const toAward = badges.filter(b=>!earnedIds.includes(b.id)&&((b.required_xp>0&&newTotal>=b.required_xp)||(b.required_tasks>0&&newDone>=b.required_tasks)))
      for(const b of toAward) await sb.from('member_badges').insert({member_id:task.assigned_to,badge_id:b.id})
      if(toAward.length>0) setToast(`🏅 ${members.find(m=>m.id===task.assigned_to)?.name} ganhou: ${toAward.map(b=>b.name).join(', ')}!`)
      else setToast(`+${xp} XP para ${members.find(m=>m.id===task.assigned_to)?.name}!`)
    }
    setTasks(prev=>prev.map(t=>t.id===task.id?{...t,status:'done',completed_at:now}:t))
    await fetchAll()
  }

  async function createProject() {
    if(!newProject.name.trim()) return
    const {data} = await sb.from('projects').insert({...newProject,budget:newProject.budget?Number(newProject.budget):null,start_date:newProject.start_date||null,end_date:newProject.end_date||null}).select().single()
    if(data){setProjects(prev=>[data,...prev]);setAddProjectModal(false);setNewProject({name:'',client_name:'',description:'',budget:'',start_date:'',end_date:'',color:'#E53E3E'})}
  }

  async function createTask(projectId:string) {
    if(!newTask.title.trim()) return
    const {data} = await sb.from('project_tasks').insert({...newTask,project_id:projectId,xp_reward:priorityXP[newTask.priority]??20,assigned_to:newTask.assigned_to||null,due_date:newTask.due_date||null}).select().single()
    if(data){setTasks(prev=>[data,...prev]);setAddTaskModal(null);setNewTask({title:'',description:'',assigned_to:'',priority:'medium',due_date:''})}
  }

  async function moveTask(taskId:string, status:string) {
    await sb.from('project_tasks').update({status}).eq('id',taskId)
    setTasks(prev=>prev.map(t=>t.id===taskId?{...t,status}:t))
  }

  async function createCampaign() {
    if(!newCampaign.client_name.trim()||!newCampaign.campaign_name.trim()) return
    const payload = {...newCampaign,budget:Number(newCampaign.budget)||0,spend:Number(newCampaign.spend)||0,impressions:Number(newCampaign.impressions)||0,clicks:Number(newCampaign.clicks)||0,leads_gen:Number(newCampaign.leads_gen)||0,conversions:Number(newCampaign.conversions)||0,revenue:Number(newCampaign.revenue)||0,period_start:newCampaign.period_start||null,period_end:newCampaign.period_end||null}
    const {data} = await sb.from('marketing_campaigns').insert(payload).select().single()
    if(data){setCampaigns(prev=>[data,...prev]);setAddCampaignModal(false);setNewCampaign({client_name:'',campaign_name:'',platform:'meta_ads',budget:'',spend:'',impressions:'',clicks:'',leads_gen:'',conversions:'',revenue:'',period_start:'',period_end:''})}
  }

  // ── Tarefas standalone ──────────────────────────────────
  async function createStandaloneTask() {
    if(!newStandaloneTask.title.trim()) return
    const xp = priorityXP[newStandaloneTask.priority]??25
    const {data:t} = await sb.from('tasks').insert({
      title:newStandaloneTask.title, description:newStandaloneTask.description||null,
      lead_id:newStandaloneTask.lead_id||null, priority:newStandaloneTask.priority,
      start_date:newStandaloneTask.start_date||null, due_date:newStandaloneTask.due_date||null,
      notes:newStandaloneTask.notes||null, xp_reward:xp, created_by:currentUser?.id||null,
    }).select().single()
    if(t) {
      for(const mid of newStandaloneTask.assignees) await sb.from('task_assignees').insert({task_id:t.id,member_id:mid})
      setStandaloneTasks(prev=>[t,...prev])
      setAddTaskStandaloneModal(false)
      setNewStandaloneTask({title:'',description:'',lead_id:'',priority:'medium',start_date:'',due_date:'',notes:'',assignees:[]})
      await sb.from('audit_log').insert({user_name:currentUser?.name,action:'CREATE_TASK',resource:'tasks',resource_id:t.id,details:{title:t.title}})
    }
  }

  async function moveStandaloneTask(taskId:string, status:string) {
    await sb.from('tasks').update({status,updated_at:new Date().toISOString()}).eq('id',taskId)
    setStandaloneTasks(prev=>prev.map(t=>t.id===taskId?{...t,status}:t))
    if(status==='done') {
      const task = standaloneTasks.find(t=>t.id===taskId)
      if(task) await awardTaskXP(task)
    }
  }

  async function awardTaskXP(task:Task) {
    const assignees = taskAssignees.filter(a=>a.task_id===task.id)
    const now = new Date()
    const isEarly = task.due_date && now < new Date(task.due_date)
    const isOnTime = task.due_date && now <= new Date(task.due_date)
    for(const a of assignees) {
      let xp = task.xp_reward
      if(isEarly) xp += XP_BONUS.early_delivery
      else if(isOnTime) xp += XP_BONUS.deadline_met
      await sb.from('xp_transactions').insert({member_id:a.member_id,points:xp,reason:`Tarefa: ${task.title}`,task_id:task.id})
      const cur = memberXP.find(x=>x.member_id===a.member_id)
      const newTotal=(cur?.total_xp??0)+xp
      const newDone=(cur?.tasks_done??0)+1
      await sb.from('member_xp').update({total_xp:newTotal,tasks_done:newDone,updated_at:new Date().toISOString()}).eq('member_id',a.member_id)
      const earnedIds=memberBadges.filter(b=>b.member_id===a.member_id).map(b=>b.badge_id)
      const toAward=badges.filter(b=>!earnedIds.includes(b.id)&&((b.required_xp>0&&newTotal>=b.required_xp)||(b.required_tasks>0&&newDone>=b.required_tasks)))
      for(const b of toAward) await sb.from('member_badges').insert({member_id:a.member_id,badge_id:b.id})
      if(toAward.length>0) setToast(`🏅 ${members.find(m=>m.id===a.member_id)?.name} conquistou: ${toAward.map(b=>b.name).join(', ')}!`)
      else setToast(`+${xp} XP → ${members.find(m=>m.id===a.member_id)?.name}!`)
    }
    await sb.from('tasks').update({completed_at:new Date().toISOString()}).eq('id',task.id)
    setStandaloneTasks(prev=>prev.map(t=>t.id===task.id?{...t,status:'done',completed_at:new Date().toISOString()}:t))
    await sendNotif(`Tarefa concluída: ${task.title}`,`${currentUser?.name??'Colaborador'} concluiu "${task.title}"`, 'task','tasks',task.id)
    await fetchAll()
  }

  async function applyPenalty(memberId:string, type:keyof typeof XP_PENALTY, reason:string) {
    const pts = XP_PENALTY[type]
    await sb.from('xp_transactions').insert({member_id:memberId,points:pts,reason})
    const cur=memberXP.find(x=>x.member_id===memberId)
    const newTotal=Math.max(0,(cur?.total_xp??0)+pts)
    await sb.from('member_xp').update({total_xp:newTotal,updated_at:new Date().toISOString()}).eq('member_id',memberId)
    setToast(`${pts} XP aplicado — ${reason}`)
    await fetchAll()
  }

  // ── Gestão de usuários ───────────────────────────────────
  async function createUser() {
    if(!newUser.name.trim()||!newUser.email.trim()||!newUser.password.trim()) return
    setSavingUser(true)
    try {
      const res = await fetch('/api/admin/create-user',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(newUser)})
      const data = await res.json()
      if(data.success) {
        setCreateUserModal(false)
        setNewUser({name:'',email:'',password:'',role:'colaborador',member_id:'',permissions:{dashboard:true,crm:true,clientes:true,tarefas:true,projetos:false,marketing:false,equipe:false,financeiro:false,integracoes:false,configuracoes:false,administracao:false}})
        setToast('Usuário criado com sucesso!')
        await fetchAll()
      } else setToast(`Erro: ${data.error}`)
    } finally { setSavingUser(false) }
  }

  async function savePermissions(profile:UserProfile) {
    const res = await fetch('/api/admin/create-user',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:profile.id,role:profile.role,permissions:profile.permissions,is_active:profile.is_active})})
    const data = await res.json()
    if(data.success) { setToast('Permissões salvas!'); setEditPermUser(null); await fetchAll() }
    else setToast(`Erro: ${data.error}`)
  }

  function getTasksInPeriod(tasks:Task[]) {
    const now=new Date(), s=new Date(), e=new Date()
    if(taskPeriod==='today'){s.setHours(0,0,0,0);e.setHours(23,59,59,999)}
    else if(taskPeriod==='week'){const d=now.getDay();s.setDate(now.getDate()-d);s.setHours(0,0,0,0);e.setDate(s.getDate()+6);e.setHours(23,59,59,999)}
    else if(taskPeriod==='month'){s.setDate(1);s.setHours(0,0,0,0);e.setMonth(e.getMonth()+1,0);e.setHours(23,59,59,999)}
    else if(taskPeriod==='quarter'){const q=Math.floor(now.getMonth()/3);s.setMonth(q*3,1);s.setHours(0,0,0,0);e.setMonth(q*3+3,0);e.setHours(23,59,59,999)}
    else if(taskPeriod==='semester'){const sem=now.getMonth()<6?0:1;s.setMonth(sem*6,1);s.setHours(0,0,0,0);e.setMonth(sem*6+6,0);e.setHours(23,59,59,999)}
    else{s.setMonth(0,1);s.setHours(0,0,0,0);e.setMonth(11,31);e.setHours(23,59,59,999)}
    return tasks.filter(t=>{const d=new Date(t.created_at);return d>=s&&d<=e})
  }

  const isOverdue=(t:Task)=>t.due_date&&!t.completed_at&&new Date(t.due_date)<new Date()

  async function createMember() {
    if(!newMember.name.trim()||!newMember.role.trim()) return
    const {data} = await sb.from('team_members').insert(newMember).select().single()
    if(data){
      setMembers(prev=>[...prev,data])
      await sb.from('member_xp').insert({member_id:data.id,total_xp:0,level:1,tasks_done:0})
      await sb.from('member_badges').insert({member_id:data.id,badge_id:1})
      setAddMemberModal(false)
      setNewMember({name:'',email:'',role:'',avatar_color:'#E53E3E'})
      await fetchAll()
    }
  }

  useEffect(()=>{
    fetchAll()
    const t = setInterval(fetchAll,20000)
    const ch = sb.channel('drop-crm')
      .on('postgres_changes',{event:'*',schema:'public',table:'leads'},()=>fetchAll())
      .on('postgres_changes',{event:'*',schema:'public',table:'interactions'},()=>fetchAll())
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'notifications'},async(payload)=>{
        const {data:{user}} = await sb.auth.getUser()
        if(payload.new&&(payload.new as Notif).recipient_id===user?.id){
          setNotifs(prev=>[payload.new as Notif,...prev])
        }
      })
      .subscribe()
    return ()=>{ clearInterval(t); sb.removeChannel(ch) }
  },[])

  useEffect(()=>{ if(msgsRef.current) msgsRef.current.scrollTop=msgsRef.current.scrollHeight },[chatLead,interactions])

  useEffect(()=>{
    sb.auth.getUser().then(({data})=>{
      if(data.user) {
        sb.from('user_profiles').select('*').eq('id',data.user.id).single().then(({data:p})=>{ if(p) setCurrentUser(p) })
        sb.from('user_profiles').update({last_login_at:new Date().toISOString()}).eq('id',data.user.id)
      }
    })
  },[])

  async function moveLead(leadId:string, stageId:number) {
    const stage = stages.find(s=>s.id===stageId)
    const lead = leads.find(l=>l.id===leadId)
    if(!stage||!lead) return

    if(stage.name==='Fechado') {
      const opStage = stages.find(s=>s.name==='Pagamento confirmado')
      const targetId = opStage?.id ?? stageId
      await sb.from('leads').update({stage_id:targetId,updated_at:new Date().toISOString()}).eq('id',leadId)
      setLeads(prev=>prev.map(l=>l.id===leadId?{...l,stage_id:targetId}:l))
      setToast(`🎉 ${lead.name} fechou! Movido para Operação — Pagamento confirmado.`)
      setPanel('operacao')
      return
    }

    if(stage.name==='Perdido') {
      await sb.from('leads').update({stage_id:stageId,updated_at:new Date().toISOString()}).eq('id',leadId)
      setLeads(prev=>prev.map(l=>l.id===leadId?{...l,stage_id:stageId}:l))
      const d = new Date(); d.setDate(d.getDate()+3)
      await sb.from('follow_ups').insert({
        lead_id:leadId,
        scheduled_at:d.toISOString(),
        next_contact_at:d.toISOString(),
        status:'pending',
        reason:'Lead perdido — follow-up automático',
        responsible:'Camila Pacheco',
        notes:[],
      })
      setToast(`${lead.name} marcado como perdido. Follow-up criado para em 3 dias.`)
      await fetchAll()
      return
    }

    await sb.from('leads').update({stage_id:stageId,updated_at:new Date().toISOString()}).eq('id',leadId)
    setLeads(prev=>prev.map(l=>l.id===leadId?{...l,stage_id:stageId}:l))

    if(stage.name==='Reunião / Sessão estratégica agendada') {
      setToast(`${lead.name} com reunião agendada! Mova para Vendas após a reunião.`)
    }
    await sendNotif(`Lead movido: ${lead.name}`,`${lead.name} foi movido para "${stage.name}"`, 'lead','leads',leadId)
  }

  async function createLead() {
    if(!newLead.name.trim()||!newLead.phone.trim()) return
    const { data } = await sb.from('leads').insert({
      ...newLead, score:0, stage_id:1, is_active:true,
      email:newLead.email||null, company_name:newLead.company_name||null,
      niche:newLead.niche||null, desired_service:newLead.desired_service||null,
      estimated_budget:newLead.estimated_budget||null,
    }).select().single()
    if(data) { setLeads(prev=>[data,...prev]); setAddLeadModal(false); setNewLead({name:'',phone:'',email:'',company_name:'',niche:'',source:'whatsapp',service_type:'recorrente',desired_service:'',estimated_budget:'',urgency:'curto_prazo',profile:'curioso'}) }
  }

  async function createFollowUp(leadId:string) {
    if(!newFu.reason.trim()||!newFu.next_contact_at) return
    await sb.from('follow_ups').insert({
      lead_id:leadId,
      scheduled_at:new Date(newFu.next_contact_at).toISOString(),
      next_contact_at:new Date(newFu.next_contact_at).toISOString(),
      status:'pending',
      reason:newFu.reason,
      responsible:newFu.responsible,
      content:newFu.content||null,
      notes:[],
    })
    setFuModal(null)
    setNewFu({reason:'',responsible:'Camila Pacheco',next_contact_at:'',content:''})
    await fetchAll()
    setToast('Follow-up criado!')
  }

  async function updateFuStatus(id:string, status:string) {
    await sb.from('follow_ups').update({status}).eq('id',id)
    setFollowUps(prev=>prev.map(f=>f.id===id?{...f,status}:f))
    if(fuDetail?.id===id) setFuDetail(prev=>prev?{...prev,status}:prev)
  }

  async function addFuNote(fu:FollowUp) {
    if(!fuNote.trim()) return
    const note = {text:fuNote.trim(),timestamp:new Date().toISOString(),author:'Camila Pacheco'}
    const notes = [...(fu.notes||[]),note]
    await sb.from('follow_ups').update({notes}).eq('id',fu.id)
    setFollowUps(prev=>prev.map(f=>f.id===fu.id?{...f,notes}:f))
    setFuDetail(prev=>prev?{...prev,notes}:prev)
    setFuNote('')
  }

  async function sendMessage() {
    if(!replyText.trim()||!chatLead||sending) return
    const text=replyText.trim(); setReplyText(''); setSending(true)
    try {
      await sb.from('interactions').insert({lead_id:chatLead.id,channel:'whatsapp',direction:'outbound',content:text,ai_generated:false})
      await sb.from('leads').update({last_interaction_at:new Date().toISOString()}).eq('id',chatLead.id)
      await fetchAll()
    } finally { setSending(false) }
  }

  async function toggleHumanTakeover(conv:AiConv) {
    const v=!conv.human_takeover
    await sb.from('ai_conversations').update({human_takeover:v}).eq('id',conv.id)
    setAiConvs(prev=>prev.map(c=>c.id===conv.id?{...c,human_takeover:v}:c))
  }

  // ── Notificações ────────────────────────────────────────
  async function sendNotif(title:string, message:string, type:string, resource?:string, resourceId?:string) {
    if(currentUser?.role==='admin') return // Admin não notifica a si mesmo
    const admins = userProfiles.filter(u=>u.role==='admin'&&u.is_active)
    for(const admin of admins) {
      await sb.from('notifications').insert({
        recipient_id:admin.id, actor_name:currentUser?.name??'Colaborador',
        title, message, type, resource:resource??null, resource_id:resourceId??null,
      })
    }
  }

  async function markAllNotifsRead() {
    const {data:{user}} = await sb.auth.getUser()
    if(!user) return
    await sb.from('notifications').update({read:true}).eq('recipient_id',user.id).eq('read',false)
    setNotifs(prev=>prev.map(n=>({...n,read:true})))
  }

  async function logout() {
    await sb.auth.signOut()
    window.location.href = '/login'
  }

  async function uploadAvatar(file:File) {
    const {data:{user}} = await sb.auth.getUser()
    if(!user) return
    setUploadingAvatar(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `${user.id}/avatar.${ext}`
      const {error:upErr} = await sb.storage.from('avatars').upload(path,file,{upsert:true})
      if(upErr) { setToast('Erro ao fazer upload da foto.'); return }
      const {data:{publicUrl}} = sb.storage.from('avatars').getPublicUrl(path)
      await sb.from('user_profiles').update({avatar_url:publicUrl}).eq('id',user.id)
      setCurrentUser(prev=>prev?{...prev,avatar_url:publicUrl}:prev)
      setUserProfiles(prev=>prev.map(p=>p.id===user.id?{...p,avatar_url:publicUrl}:p))
      setToast('Foto atualizada!')
    } finally { setUploadingAvatar(false) }
  }

  async function saveProfile() {
    const {data:{user}} = await sb.auth.getUser()
    if(!user||!editName.trim()) return
    await sb.from('user_profiles').update({name:editName}).eq('id',user.id)
    setCurrentUser(prev=>prev?{...prev,name:editName}:prev)
    setProfileModal(false)
    setToast('Perfil atualizado!')
  }

  const notifUnread = notifs.filter(n=>!n.read).length

  // ── Tarefas: variáveis pré-computadas ──────────────────
  const periodTasks = getTasksInPeriod(standaloneTasks)
  const TASK_ST_LABEL: Record<string,string> = {todo:'Não iniciada',in_progress:'Em andamento',review:'Em revisão',done:'Concluída',cancelled:'Cancelada'}
  const TASK_ST_COLOR: Record<string,string> = {todo:'#6B7280',in_progress:'#3B82F6',review:'#F59E0B',done:'#10B981',cancelled:'#4B5563'}
  const PERIOD_LABELS: Record<string,string> = {today:'Hoje',week:'Semana',month:'Mês',quarter:'Trimestre',semester:'Semestre',year:'Ano'}
  const taskDone = periodTasks.filter(t=>t.status==='done').length
  const taskInProg = periodTasks.filter(t=>t.status==='in_progress').length
  const taskReview = periodTasks.filter(t=>t.status==='review').length
  const taskTodo = periodTasks.filter(t=>t.status==='todo').length
  const taskOverdue = periodTasks.filter(t=>isOverdue(t)).length

  const totalLeads = leads.length
  const today = new Date().toISOString().split('T')[0]
  const todayLeads = leads.filter(l=>l.created_at.startsWith(today)).length
  const hotLeads = leads.filter(l=>(l.score??0)>=70).length
  const pendingFu = followUps.filter(f=>f.status==='pending').length
  const stageMap = useMemo(()=>Object.fromEntries(stages.map(s=>[s.id,s])),[stages])

  const leadsPerDay = useMemo(()=>Array.from({length:10},(_,i)=>{
    const d=new Date(); d.setDate(d.getDate()-(9-i))
    return leads.filter(l=>l.created_at.startsWith(d.toISOString().split('T')[0])).length
  }),[leads])

  const leadInteractions = (id:string) => interactions.filter(i=>i.lead_id===id).sort((a,b)=>new Date(a.created_at).getTime()-new Date(b.created_at).getTime())
  const leadAiConv = (id:string) => aiConvs.find(c=>c.lead_id===id)

  const inp: React.CSSProperties = {padding:'9px 12px',background:'#0D0D0D',border:'1px solid rgba(255,255,255,0.08)',borderRadius:8,color:'#F9FAFB',fontSize:13,outline:'none',width:'100%',fontFamily:'Montserrat,sans-serif'}
  const sel: React.CSSProperties = {...inp,cursor:'pointer'}

  const navStyle = (id:string): React.CSSProperties => ({
    display:'flex',alignItems:'center',gap:10,padding:'9px 14px',borderRadius:8,cursor:'pointer',
    fontSize:12,fontWeight:panel===id?600:400,
    background:panel===id?'rgba(229,62,62,0.1)':'transparent',
    color:panel===id?'#FFFFFF':'#D1D5DB',
    transition:'all 0.15s',position:'relative',
    borderLeft:panel===id?'2px solid #E53E3E':'2px solid transparent',
    marginBottom:1,
  })

  function KanbanBoard({ kanbanKey, title, subtitle }: { kanbanKey:string, title:string, subtitle:string }) {
    const kStages = stages.filter(s=>s.kanban===kanbanKey)
    const VENDAS_FU_STAGES = ['Reunião realizada','Proposta enviada','Em negociação','Perdido']
    return (
      <div style={{height:'100%',display:'flex',flexDirection:'column'}}>
        <div style={{padding:'20px 24px 16px',borderBottom:'1px solid rgba(255,255,255,0.06)'}}>
          <h2 style={{fontSize:20,fontWeight:700,color:'#F9FAFB',margin:0}}>{title}</h2>
          <p style={{fontSize:12,color:'#6B7280',margin:'4px 0 0'}}>{subtitle}</p>
        </div>
        <div style={{flex:1,overflowX:'auto',padding:'16px 24px 24px',display:'flex',gap:12}}>
          {kStages.map(stage=>{
            const colLeads = leads.filter(l=>l.stage_id===stage.id&&(!search||(l.name??'').toLowerCase().includes(search.toLowerCase())||l.phone.includes(search)))
            const isOver = dragOver===stage.id
            const showFuBtn = kanbanKey==='vendas'&&VENDAS_FU_STAGES.includes(stage.name)
            return (
              <div key={stage.id}
                style={{width:240,flexShrink:0,display:'flex',flexDirection:'column',gap:8,background:isOver?'rgba(229,62,62,0.05)':'rgba(10,10,10,0.65)',border:`1px solid ${isOver?'rgba(229,62,62,0.3)':'rgba(255,255,255,0.06)'}`,borderRadius:12,padding:12,minHeight:'calc(100vh - 220px)',transition:'all 0.15s',backdropFilter:'blur(10px)'}}
                onDragOver={e=>{e.preventDefault();setDragOver(stage.id)}}
                onDragLeave={()=>setDragOver(null)}
                onDrop={e=>{e.preventDefault();const id=e.dataTransfer.getData('leadId');if(id)moveLead(id,stage.id);setDragOver(null)}}
              >
                <div style={{display:'flex',alignItems:'center',gap:7,paddingBottom:10,borderBottom:'1px solid rgba(255,255,255,0.05)'}}>
                  <span style={{width:7,height:7,borderRadius:'50%',background:stage.color,boxShadow:`0 0 6px ${stage.color}`,flexShrink:0}}/>
                  <span style={{fontSize:11,fontWeight:500,color:'#D1D5DB',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{stage.name}</span>
                  <span style={{fontSize:10,fontWeight:700,background:colLeads.length>0?`${stage.color}20`:'rgba(255,255,255,0.05)',color:colLeads.length>0?stage.color:'#4B5563',padding:'1px 7px',borderRadius:999}}>{colLeads.length}</span>
                </div>
                <div style={{display:'flex',flexDirection:'column',gap:7,flex:1}}>
                  {colLeads.length===0&&<p style={{fontSize:11,color:'#374151',textAlign:'center',paddingTop:20}}>Sem leads</p>}
                  {colLeads.map(lead=>{
                    const isHot=(lead.score??0)>=70
                    return (
                      <div key={lead.id} draggable
                        onDragStart={e=>{e.dataTransfer.setData('leadId',lead.id)}}
                        onDragEnd={()=>setDragOver(null)}
                        style={{background:'rgba(8,8,8,0.8)',border:`1px solid ${isHot?'rgba(229,62,62,0.25)':'rgba(255,255,255,0.05)'}`,borderRadius:10,padding:'11px 12px',cursor:'grab',boxShadow:isHot?'0 0 12px rgba(229,62,62,0.1)':'none',backdropFilter:'blur(8px)'}}
                      >
                        <div style={{display:'flex',justifyContent:'space-between',gap:4,marginBottom:2}}>
                          <p style={{fontSize:12,fontWeight:600,color:'#F9FAFB',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flex:1,margin:0,cursor:'pointer'}} onClick={()=>setDetailLead(lead)}>{lead.name}</p>
                          <span style={{fontSize:10,fontWeight:700,color:scoreColor(lead.score),flexShrink:0}}>{lead.score}</span>
                        </div>
                        {(lead.company_name||lead.niche)&&<p style={{fontSize:10,color:'#6B7280',margin:'0 0 6px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{lead.company_name??lead.niche}</p>}
                        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:4}}>
                          {lead.profile&&<span style={{fontSize:9,fontWeight:600,color:profileColor[lead.profile]||'#6B7280',background:`${profileColor[lead.profile]||'#1F2937'}18`,padding:'2px 6px',borderRadius:999,textTransform:'uppercase'}}>{profileLabel[lead.profile]||lead.profile}</span>}
                          <div style={{display:'flex',gap:4,marginLeft:'auto'}}>
                            {showFuBtn&&(
                              <button onClick={e=>{e.stopPropagation();setFuModal({leadId:lead.id})}} style={{fontSize:9,padding:'2px 6px',borderRadius:5,background:'rgba(245,158,11,0.1)',border:'1px solid rgba(245,158,11,0.3)',color:'#F59E0B',cursor:'pointer',fontWeight:600}}>FU</button>
                            )}
                            <button onClick={e=>{e.stopPropagation();setChatLead(lead)}} style={{fontSize:9,padding:'2px 6px',borderRadius:5,background:'rgba(59,130,246,0.1)',border:'1px solid rgba(59,130,246,0.25)',color:'#60A5FA',cursor:'pointer'}}>Chat</button>
                          </div>
                        </div>
                        <div style={{fontSize:9,color:'#374151',marginTop:4,textAlign:'right'}}>{timeAgo(lead.updated_at)}</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  const monthlyRev = [42,55,48,62,57,70,65,78,72,80,88,95]
  const monthLabels = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

  return (
    <div style={{display:'flex',height:'100vh',overflow:'hidden',background:'#070707',fontFamily:'Montserrat,sans-serif',position:'relative'}}>

      {/* BG 3D */}
      <div aria-hidden style={{position:'fixed',inset:0,zIndex:0,overflow:'hidden',pointerEvents:'none'}}>
        <div style={{position:'absolute',width:'250%',height:'220%',left:'-75%',top:'28%',backgroundImage:`linear-gradient(rgba(229,62,62,0.14) 1px,transparent 1px),linear-gradient(90deg,rgba(229,62,62,0.14) 1px,transparent 1px)`,backgroundSize:'52px 52px',transform:'perspective(650px) rotateX(74deg)',transformOrigin:'50% 0%',WebkitMaskImage:'linear-gradient(to bottom,transparent 0%,rgba(0,0,0,0.6) 25%,black 55%)',maskImage:'linear-gradient(to bottom,transparent 0%,rgba(0,0,0,0.6) 25%,black 55%)'}}/>
        <div style={{position:'absolute',width:'800px',height:'600px',right:'-150px',top:'-200px',background:'radial-gradient(ellipse at center,rgba(185,14,14,0.5) 0%,transparent 65%)'}}/>
        <div style={{position:'absolute',width:'600px',height:'300px',left:'30%',bottom:'-50px',background:'radial-gradient(ellipse at center,rgba(140,8,8,0.18) 0%,transparent 70%)'}}/>
        <div style={{position:'absolute',inset:0,background:'linear-gradient(to right,rgba(7,7,7,0.7) 0%,transparent 30%,transparent 70%,rgba(7,7,7,0.3) 100%)'}}/>
      </div>

      {/* SIDEBAR */}
      <aside style={{width:220,background:'rgba(5,5,5,0.88)',borderRight:'1px solid rgba(255,255,255,0.07)',display:'flex',flexDirection:'column',flexShrink:0,backdropFilter:'blur(20px)',position:'relative',zIndex:2}}>
        <div style={{padding:'20px 16px 16px',borderBottom:'1px solid rgba(255,255,255,0.06)'}}>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <div style={{width:38,height:38,borderRadius:9,overflow:'hidden',flexShrink:0,border:'1px solid rgba(255,255,255,0.1)',boxShadow:'0 0 18px rgba(229,62,62,0.35)'}}>
              <div style={{width:'100%',height:'100%',backgroundImage:'url(/logo.png)',backgroundSize:'290%',backgroundPosition:'52% 26%',backgroundRepeat:'no-repeat'}}/>
            </div>
            <div>
              <div style={{fontSize:13,fontWeight:700,color:'#F9FAFB',letterSpacing:'-0.01em'}}>DROP Agency</div>
              <div style={{fontSize:10,color:'#4B5563',letterSpacing:'0.04em'}}>CRM Platform</div>
            </div>
          </div>
        </div>

        <nav style={{flex:1,padding:'12px 10px',overflowY:'auto'}}>
          <div style={{fontSize:9,fontWeight:600,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:'0.15em',padding:'4px 14px 8px'}}>VISÃO GERAL</div>
          {NAV.slice(0,1).map(n=>(
            <div key={n.id} style={navStyle(n.id)} onClick={()=>setPanel(n.id)}>
              <span style={{color:panel===n.id?'#E53E3E':'#4B5563',display:'flex'}}>{NAV_ICONS[n.id]}</span>{n.label}
            </div>
          ))}

          <div style={{fontSize:9,fontWeight:600,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:'0.15em',padding:'12px 14px 8px'}}>JORNADA DO LEAD</div>
          {NAV.slice(1,4).map(n=>(
            <div key={n.id} style={navStyle(n.id)} onClick={()=>setPanel(n.id)}>
              <span style={{color:panel===n.id?'#E53E3E':'#4B5563',display:'flex'}}>{NAV_ICONS[n.id]}</span>
              {n.label}
              <span style={{marginLeft:'auto',fontSize:9,fontWeight:700,background:'rgba(255,255,255,0.06)',color:'#6B7280',padding:'1px 6px',borderRadius:99}}>
                {leads.filter(l=>stages.find(s=>s.id===l.stage_id)?.kanban===n.id).length}
              </span>
            </div>
          ))}

          <div style={{fontSize:9,fontWeight:600,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:'0.15em',padding:'12px 14px 8px'}}>GESTÃO</div>
          {[NAV[4],NAV[5],NAV[6],NAV[7],NAV[8]].map(n=>(
            <div key={n.id} style={navStyle(n.id)} onClick={()=>setPanel(n.id)}>
              <span style={{color:panel===n.id?'#E53E3E':'#4B5563',display:'flex'}}>{NAV_ICONS[n.id]}</span>
              {n.label}
              {n.id==='followup'&&pendingFu>0&&<span style={{marginLeft:'auto',fontSize:9,fontWeight:700,background:'rgba(245,158,11,0.15)',color:'#F59E0B',padding:'1px 6px',borderRadius:99}}>{pendingFu}</span>}
              {n.id==='tarefas'&&standaloneTasks.filter(t=>t.status!=='done'&&t.status!=='cancelled').length>0&&<span style={{marginLeft:'auto',fontSize:9,fontWeight:700,background:'rgba(229,62,62,0.12)',color:'#E53E3E',padding:'1px 6px',borderRadius:99}}>{standaloneTasks.filter(t=>t.status!=='done'&&t.status!=='cancelled').length}</span>}
              {n.id==='projetos'&&projects.filter(p=>p.status==='active').length>0&&<span style={{marginLeft:'auto',fontSize:9,fontWeight:700,background:'rgba(255,255,255,0.06)',color:'#9CA3AF',padding:'1px 6px',borderRadius:99}}>{projects.filter(p=>p.status==='active').length}</span>}
            </div>
          ))}

          <div style={{fontSize:9,fontWeight:600,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:'0.15em',padding:'12px 14px 8px'}}>SISTEMA</div>
          {NAV.slice(9,12).map(n=>(
            <div key={n.id} style={navStyle(n.id)} onClick={()=>setPanel(n.id)}>
              <span style={{color:panel===n.id?'#E53E3E':'#4B5563',display:'flex'}}>{NAV_ICONS[n.id]}</span>{n.label}
            </div>
          ))}
          {(currentUser?.role==='admin'||currentUser===null)&&(
            <div style={navStyle('administracao')} onClick={()=>setPanel('administracao')}>
              <span style={{color:panel==='administracao'?'#E53E3E':'#4B5563',display:'flex'}}>{NAV_ICONS['administracao']}</span>
              Administração
              <span style={{marginLeft:'auto',fontSize:8,fontWeight:700,background:'rgba(229,62,62,0.15)',color:'#E53E3E',padding:'1px 5px',borderRadius:99}}>ADM</span>
            </div>
          )}
        </nav>

        <div style={{margin:'0 10px 10px',borderRadius:10,border:'1px solid rgba(229,62,62,0.2)',background:'linear-gradient(135deg,rgba(229,62,62,0.08),rgba(229,62,62,0.02))',padding:'12px 14px',cursor:'pointer'}} onClick={()=>setPanel('dashboard')}>
          <div style={{fontSize:11,fontWeight:600,color:'#F9FAFB',marginBottom:3,display:'flex',alignItems:'center',gap:6}}><span style={{color:'#E53E3E'}}>✦</span> DROP AI Copilot</div>
          <div style={{fontSize:10,color:'#6B7280'}}>Análise inteligente dos leads</div>
        </div>

        <div style={{padding:'10px',borderTop:'1px solid rgba(255,255,255,0.06)',position:'relative'}}>
          <div onClick={()=>setProfileMenuOpen(p=>!p)} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 10px',borderRadius:8,cursor:'pointer'}}
            onMouseEnter={e=>(e.currentTarget.style.background='rgba(255,255,255,0.04)')}
            onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
            <div style={{width:32,height:32,borderRadius:'50%',overflow:'hidden',flexShrink:0,border:'2px solid rgba(229,62,62,0.4)'}}>
              {currentUser?.avatar_url
                ?<img src={currentUser.avatar_url} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/>
                :<div style={{width:'100%',height:'100%',background:'linear-gradient(135deg,#E53E3E,#B91C1C)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,color:'#fff'}}>{(currentUser?.name??'U').split(' ').map((w:string)=>w[0]).join('').slice(0,2).toUpperCase()}</div>
              }
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:12,fontWeight:600,color:'#F9FAFB',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{currentUser?.name??'Usuário'}</div>
              <div style={{fontSize:10,color:currentUser?.role==='admin'?'#E53E3E':'#6B7280'}}>{currentUser?.role==='admin'?'👑 Admin':'⚡ Colaborador'}</div>
            </div>
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2 4l4 4 4-4" stroke="#4B5563" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </div>

          {profileMenuOpen&&(
            <div style={{position:'absolute',bottom:'calc(100% + 4px)',left:10,right:10,background:'#111',border:'1px solid rgba(255,255,255,0.1)',borderRadius:10,overflow:'hidden',zIndex:100,boxShadow:'0 -8px 24px rgba(0,0,0,0.5)'}}>
              <div onClick={()=>{setProfileMenuOpen(false);setEditName(currentUser?.name??'');setProfileModal(true)}} style={{display:'flex',alignItems:'center',gap:10,padding:'11px 14px',cursor:'pointer'}}
                onMouseEnter={e=>(e.currentTarget.style.background='rgba(255,255,255,0.05)')}
                onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="6" r="3" stroke="#9CA3AF" strokeWidth="1.4"/><path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="#9CA3AF" strokeWidth="1.4" strokeLinecap="round"/></svg>
                <span style={{fontSize:13,color:'#D1D5DB'}}>Configurar Perfil</span>
              </div>
              <div style={{height:'1px',background:'rgba(255,255,255,0.06)'}}/>
              <div onClick={()=>{setProfileMenuOpen(false);logout()}} style={{display:'flex',alignItems:'center',gap:10,padding:'11px 14px',cursor:'pointer'}}
                onMouseEnter={e=>(e.currentTarget.style.background='rgba(229,62,62,0.08)')}
                onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M6 2H3a1 1 0 00-1 1v10a1 1 0 001 1h3M10 11l4-4-4-4M14 8H6" stroke="#E53E3E" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                <span style={{fontSize:13,color:'#E53E3E',fontWeight:500}}>Sair da conta</span>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* MAIN */}
      <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden',position:'relative',zIndex:2}}>

        {/* Topbar */}
        <div style={{height:56,borderBottom:'1px solid rgba(255,255,255,0.07)',background:'rgba(8,8,8,0.88)',backdropFilter:'blur(24px)',display:'flex',alignItems:'center',gap:12,padding:'0 20px',flexShrink:0,position:'relative',zIndex:5}}>
          <div style={{flex:1,position:'relative'}}>
            <svg style={{position:'absolute',left:12,top:'50%',transform:'translateY(-50%)',color:'#4B5563'}} width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5"/><path d="M10 10l2.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            <input placeholder="Buscar leads, deals, clientes..." value={search} onChange={e=>setSearch(e.target.value)} style={{...inp,paddingLeft:34,maxWidth:380,fontSize:12,height:36,borderRadius:8}}/>
          </div>
          <button onClick={()=>setAddLeadModal(true)} style={{padding:'8px 16px',borderRadius:8,border:'none',fontSize:12,fontWeight:600,color:'#fff',cursor:'pointer',background:'linear-gradient(135deg,#E53E3E,#B91C1C)',boxShadow:'0 0 20px rgba(229,62,62,0.4)',whiteSpace:'nowrap',flexShrink:0}}>+ Novo Lead</button>
          <div style={{display:'flex',alignItems:'center',gap:8,position:'relative'}}>
            {/* Sino notificações */}
            <div style={{position:'relative'}}>
              <button onClick={()=>{setNotifOpen(p=>!p);if(!notifOpen)markAllNotifsRead()}} style={{width:36,height:36,borderRadius:8,background:'transparent',border:'1px solid rgba(255,255,255,0.06)',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',color:notifUnread>0?'#E53E3E':'#6B7280',position:'relative'}}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 2a5 5 0 00-5 5c0 2.5-.5 3.5-1.5 4.5h13C13.5 10.5 13 9.5 13 7a5 5 0 00-5-5zM6.5 13.5a1.5 1.5 0 003 0" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
                {notifUnread>0&&<span style={{position:'absolute',top:-4,right:-4,width:16,height:16,borderRadius:'50%',background:'#E53E3E',fontSize:9,fontWeight:700,color:'#fff',display:'flex',alignItems:'center',justifyContent:'center'}}>{notifUnread>9?'9+':notifUnread}</span>}
              </button>

              {notifOpen&&(
                <div style={{position:'absolute',top:'calc(100% + 8px)',right:0,width:340,background:'#111',border:'1px solid rgba(255,255,255,0.1)',borderRadius:12,boxShadow:'0 8px 32px rgba(0,0,0,0.5)',zIndex:100,overflow:'hidden'}}>
                  <div style={{padding:'12px 16px',borderBottom:'1px solid rgba(255,255,255,0.06)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <span style={{fontSize:13,fontWeight:600,color:'#F9FAFB'}}>Notificações</span>
                    {notifUnread>0&&<span style={{fontSize:10,color:'#6B7280'}}>{notifUnread} não lida{notifUnread>1?'s':''}</span>}
                  </div>
                  <div style={{maxHeight:320,overflowY:'auto'}}>
                    {notifs.length===0&&<p style={{padding:24,textAlign:'center',color:'#4B5563',fontSize:13}}>Nenhuma notificação</p>}
                    {notifs.map(n=>{
                      const typeIcon:{[k:string]:string}={task:'✓',lead:'→',followup:'⏰',user:'👤',system:'⚙'}
                      const typeColor:{[k:string]:string}={task:'#10B981',lead:'#3B82F6',followup:'#F59E0B',user:'#8B5CF6',system:'#6B7280'}
                      return (
                        <div key={n.id} style={{padding:'12px 16px',borderBottom:'1px solid rgba(255,255,255,0.04)',background:n.read?'transparent':'rgba(229,62,62,0.04)'}}>
                          <div style={{display:'flex',gap:10,alignItems:'flex-start'}}>
                            <div style={{width:28,height:28,borderRadius:'50%',background:`${typeColor[n.type]||'#6B7280'}18`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,color:typeColor[n.type]||'#6B7280',flexShrink:0}}>{typeIcon[n.type]||'·'}</div>
                            <div style={{flex:1}}>
                              <div style={{fontSize:12,fontWeight:600,color:'#F9FAFB',marginBottom:2}}>{n.title}</div>
                              <div style={{fontSize:11,color:'#6B7280',lineHeight:1.4}}>{n.message}</div>
                              <div style={{fontSize:10,color:'#374151',marginTop:4}}>{n.actor_name} · {timeAgo(n.created_at)}</div>
                            </div>
                            {!n.read&&<div style={{width:6,height:6,borderRadius:'50%',background:'#E53E3E',flexShrink:0,marginTop:4}}/>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Avatar topbar */}
            <div onClick={()=>setProfileMenuOpen(p=>!p)} style={{width:32,height:32,borderRadius:'50%',overflow:'hidden',cursor:'pointer',border:'1px solid rgba(229,62,62,0.3)'}}>
              {currentUser?.avatar_url
                ?<img src={currentUser.avatar_url} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/>
                :<div style={{width:'100%',height:'100%',background:'linear-gradient(135deg,#E53E3E,#B91C1C)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:700,color:'#fff'}}>{(currentUser?.name??'U').split(' ').map((w:string)=>w[0]).join('').slice(0,2).toUpperCase()}</div>
              }
            </div>
          </div>
        </div>

        <div style={{flex:1,overflowY:'auto',overflowX:'hidden'}}>

          {/* ── DASHBOARD ── */}
          {panel==='dashboard'&&(
            <div style={{padding:28}}>
              <div style={{marginBottom:24}}>
                <h1 style={{fontSize:24,fontWeight:800,color:'#F9FAFB',letterSpacing:'-0.03em',margin:0}}>Dashboard Executivo</h1>
                <p style={{fontSize:13,color:'#6B7280',margin:'6px 0 0'}}>Visão consolidada da operação DROP — leads, pipeline, vendas e performance em tempo real</p>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:20}}>
                <KpiCard label="Total de Leads" value={totalLeads} trend={8.2}/>
                <KpiCard label="Aquisição" value={leads.filter(l=>stageMap[l.stage_id]?.kanban==='aquisicao').length} trend={12.5}/>
                <KpiCard label="Em Vendas" value={leads.filter(l=>stageMap[l.stage_id]?.kanban==='vendas').length} trend={-3.1}/>
                <KpiCard label="Operação" value={leads.filter(l=>stageMap[l.stage_id]?.kanban==='operacao').length} trend={6.4}/>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:24}}>
                <KpiCard label="Leads Hoje" value={todayLeads} trend={0}/>
                <KpiCard label="Quentes" value={hotLeads} trend={15.2}/>
                <KpiCard label="Follow-ups" value={pendingFu} trend={-1.8}/>
                <KpiCard label="Fechados" value={leads.filter(l=>stageMap[l.stage_id]?.kanban==='operacao').length} trend={22.4}/>
              </div>

              {/* Jornada visual */}
              <div style={{background:'rgba(10,10,10,0.75)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:12,padding:'20px',backdropFilter:'blur(12px)',marginBottom:16}}>
                <div style={{fontSize:12,fontWeight:600,color:'#F9FAFB',marginBottom:16}}>Jornada do Lead</div>
                <div style={{display:'flex',alignItems:'center',gap:0}}>
                  {['Aquisição','Vendas','Operação'].map((k,ki)=>{
                    const kKey = ['aquisicao','vendas','operacao'][ki]
                    const count = leads.filter(l=>stageMap[l.stage_id]?.kanban===kKey).length
                    const colors = ['#E53E3E','#3B82F6','#10B981']
                    return (
                      <React.Fragment key={k}>
                        <div onClick={()=>setPanel(kKey)} style={{flex:1,background:`${colors[ki]}12`,border:`1px solid ${colors[ki]}30`,borderRadius:10,padding:'14px 16px',cursor:'pointer',transition:'all 0.2s'}}
                          onMouseEnter={e=>(e.currentTarget.style.borderColor=`${colors[ki]}60`)}
                          onMouseLeave={e=>(e.currentTarget.style.borderColor=`${colors[ki]}30`)}
                        >
                          <div style={{fontSize:11,color:colors[ki],fontWeight:600,marginBottom:6,textTransform:'uppercase',letterSpacing:'0.1em'}}>{k}</div>
                          <div style={{fontSize:28,fontWeight:800,color:'#F9FAFB'}}>{count}</div>
                          <div style={{fontSize:10,color:'#6B7280',marginTop:4}}>{stages.filter(s=>s.kanban===kKey).length} etapas</div>
                        </div>
                        {ki<2&&<div style={{display:'flex',alignItems:'center',padding:'0 8px',color:'#374151',fontSize:18}}>→</div>}
                      </React.Fragment>
                    )
                  })}
                </div>
              </div>

              <div style={{display:'grid',gridTemplateColumns:'1.5fr 1fr',gap:16}}>
                <div style={{background:'rgba(10,10,10,0.75)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:12,padding:'20px 20px 12px',backdropFilter:'blur(12px)'}}>
                  <div style={{fontSize:11,fontWeight:600,color:'#6B7280',textTransform:'uppercase',letterSpacing:'0.12em',marginBottom:4}}>Leads — últimos 10 dias</div>
                  <div style={{fontSize:28,fontWeight:800,color:'#F9FAFB',marginBottom:4}}>{leadsPerDay.reduce((a,b)=>a+b,0)}</div>
                  <AreaChart data={leadsPerDay.map(v=>v||0.1)} id="leads10" height={80}/>
                  <div style={{display:'flex',justifyContent:'space-between',marginTop:6}}>
                    {leadsPerDay.map((_,i)=>{const d=new Date();d.setDate(d.getDate()-(9-i));return <span key={i} style={{fontSize:9,color:'#374151'}}>{d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})}</span>})}
                  </div>
                </div>
                <div style={{background:'rgba(10,10,10,0.75)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:12,padding:'20px',backdropFilter:'blur(12px)'}}>
                  <div style={{fontSize:11,fontWeight:600,color:'#6B7280',textTransform:'uppercase',letterSpacing:'0.12em',marginBottom:16}}>Pipeline por Etapa</div>
                  {stages.slice(0,6).map(s=>{
                    const c=leads.filter(l=>l.stage_id===s.id).length
                    const pct=totalLeads>0?Math.round(c/totalLeads*100):0
                    return (
                      <div key={s.id} style={{marginBottom:10}}>
                        <div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}>
                          <span style={{fontSize:10,color:'#9CA3AF',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:140}}>{s.name}</span>
                          <span style={{fontSize:10,fontWeight:700,color:'#F9FAFB'}}>{c}</span>
                        </div>
                        <div style={{height:3,background:'rgba(255,255,255,0.06)',borderRadius:999}}><div style={{height:'100%',width:`${pct}%`,background:s.color,borderRadius:999}}/></div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ── KANBANS ── */}
          {panel==='aquisicao'&&<KanbanBoard kanbanKey="aquisicao" title="Aquisição" subtitle="Entrada e qualificação de leads — do frio ao qualificado com reunião agendada"/>}
          {panel==='vendas'&&<KanbanBoard kanbanKey="vendas" title="Vendas" subtitle="Processo comercial — reunião → proposta → fechamento. Botão FU para criar follow-up manual."/>}
          {panel==='operacao'&&<KanbanBoard kanbanKey="operacao" title="Operação" subtitle="Entrega e relacionamento pós-fechamento — acompanhe cada cliente ativo"/>}

          {/* ── FOLLOW-UP ── */}
          {panel==='followup'&&(
            <div style={{padding:28}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:24}}>
                <div>
                  <h2 style={{fontSize:20,fontWeight:700,color:'#F9FAFB',margin:0}}>Follow-up</h2>
                  <p style={{fontSize:12,color:'#6B7280',margin:'4px 0 0'}}>Todos os leads que precisam de retorno</p>
                </div>
                <button onClick={()=>setFuModal({leadId:''})} style={{padding:'8px 16px',borderRadius:8,border:'none',fontSize:12,fontWeight:600,color:'#fff',cursor:'pointer',background:'linear-gradient(135deg,#E53E3E,#B91C1C)'}}>+ Novo Follow-up</button>
              </div>

              <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12,marginBottom:20}}>
                {[
                  {v:followUps.filter(f=>f.status==='pending').length,l:'Pendentes',c:'#F59E0B'},
                  {v:followUps.filter(f=>f.status==='done').length,l:'Concluídos',c:'#10B981'},
                  {v:followUps.filter(f=>f.status==='ignored').length,l:'Ignorados',c:'#6B7280'},
                ].map((m,i)=>(
                  <div key={i} style={{background:'rgba(10,10,10,0.75)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:12,padding:'18px 20px',backdropFilter:'blur(12px)'}}>
                    <div style={{fontSize:28,fontWeight:800,color:m.c,letterSpacing:'-0.03em'}}>{m.v}</div>
                    <div style={{fontSize:10,color:'#6B7280',marginTop:6,textTransform:'uppercase',letterSpacing:'0.12em'}}>{m.l}</div>
                  </div>
                ))}
              </div>

              <div style={{display:'flex',gap:16}}>
                {/* Lista */}
                <div style={{flex:1,background:'rgba(10,10,10,0.75)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:12,overflow:'hidden',backdropFilter:'blur(12px)'}}>
                  <div style={{padding:'14px 20px',borderBottom:'1px solid rgba(255,255,255,0.06)',display:'flex',gap:8}}>
                    {['Todos','Pendentes','Concluídos','Ignorados'].map(f=>(
                      <button key={f} style={{fontSize:11,padding:'4px 10px',borderRadius:6,border:'1px solid rgba(255,255,255,0.08)',background:fuDetail?'transparent':'rgba(229,62,62,0.1)',color:'#D1D5DB',cursor:'pointer',fontWeight:500}}>{f}</button>
                    ))}
                  </div>
                  {followUps.length===0&&<p style={{padding:36,textAlign:'center',color:'#4B5563',fontSize:13}}>Nenhum follow-up ainda.<br/><span style={{fontSize:11,opacity:0.6}}>Follow-ups são criados quando um lead é marcado como Perdido ou manualmente.</span></p>}
                  {followUps.map(fu=>{
                    const lead=leads.find(l=>l.id===fu.lead_id)
                    const stage=lead?stageMap[lead.stage_id]:null
                    const sc:Record<string,string>={pending:'#F59E0B',done:'#10B981',ignored:'#6B7280',sent:'#3B82F6',cancelled:'#6B7280',failed:'#EF4444'}
                    const sl:Record<string,string>={pending:'Pendente',done:'Concluído',ignored:'Ignorado',sent:'Enviado',cancelled:'Cancelado',failed:'Falhou'}
                    const isSelected = fuDetail?.id===fu.id
                    return (
                      <div key={fu.id}
                        onClick={()=>setFuDetail(isSelected?null:fu)}
                        style={{display:'flex',alignItems:'center',gap:12,padding:'14px 20px',borderBottom:'1px solid rgba(255,255,255,0.04)',cursor:'pointer',background:isSelected?'rgba(229,62,62,0.06)':'transparent',transition:'background 0.15s'}}
                      >
                        <div style={{width:36,height:36,borderRadius:'50%',background:'rgba(229,62,62,0.12)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,color:'#E53E3E',flexShrink:0}}>{lead?initials(lead.name,lead.phone):'?'}</div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:13,fontWeight:500,color:'#F9FAFB'}}>{lead?.name??'Lead desconhecido'}</div>
                          <div style={{fontSize:11,color:'#6B7280',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{fu.reason??'Sem motivo definido'}</div>
                        </div>
                        <div style={{textAlign:'right',flexShrink:0}}>
                          {stage&&<div style={{fontSize:10,color:'#9CA3AF',marginBottom:3}}>{stage.name}</div>}
                          {fu.next_contact_at&&<div style={{fontSize:10,color:'#6B7280'}}>{fmtDateShort(fu.next_contact_at)}</div>}
                        </div>
                        <span style={{fontSize:10,fontWeight:600,color:sc[fu.status]||'#6B7280',background:`${sc[fu.status]||'#374151'}18`,padding:'2px 8px',borderRadius:999,flexShrink:0}}>{sl[fu.status]||fu.status}</span>
                      </div>
                    )
                  })}
                </div>

                {/* Detalhe */}
                {fuDetail&&(()=>{
                  const lead=leads.find(l=>l.id===fuDetail.lead_id)
                  const sc:Record<string,string>={pending:'#F59E0B',done:'#10B981',ignored:'#6B7280'}
                  return (
                    <div style={{width:320,background:'rgba(10,10,10,0.75)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:12,padding:20,backdropFilter:'blur(12px)',flexShrink:0,display:'flex',flexDirection:'column',gap:14}}>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                        <div style={{fontSize:14,fontWeight:700,color:'#F9FAFB'}}>{lead?.name??'Lead'}</div>
                        <button onClick={()=>setFuDetail(null)} style={{background:'none',border:'none',color:'#6B7280',cursor:'pointer',fontSize:16}}>×</button>
                      </div>
                      {[
                        {k:'Motivo',v:fuDetail.reason},
                        {k:'Responsável',v:fuDetail.responsible},
                        {k:'Próximo contato',v:fuDetail.next_contact_at?fmtDateShort(fuDetail.next_contact_at):null},
                        {k:'Etapa atual',v:lead?stageMap[lead.stage_id]?.name:null},
                      ].map(({k,v})=>v?(
                        <div key={k}>
                          <div style={{fontSize:9,fontWeight:600,color:'#4B5563',textTransform:'uppercase',letterSpacing:'0.12em',marginBottom:3}}>{k}</div>
                          <div style={{fontSize:12,color:'#D1D5DB'}}>{v}</div>
                        </div>
                      ):null)}
                      <div>
                        <div style={{fontSize:9,fontWeight:600,color:'#4B5563',textTransform:'uppercase',letterSpacing:'0.12em',marginBottom:8}}>Status</div>
                        <div style={{display:'flex',gap:6}}>
                          {['pending','done','ignored'].map(s=>(
                            <button key={s} onClick={()=>updateFuStatus(fuDetail.id,s)} style={{fontSize:10,padding:'4px 10px',borderRadius:6,border:'1px solid',cursor:'pointer',fontWeight:600,background:fuDetail.status===s?`${sc[s]}18`:'transparent',color:fuDetail.status===s?sc[s]:'#6B7280',borderColor:fuDetail.status===s?`${sc[s]}40`:'rgba(255,255,255,0.08)'}}>
                              {s==='pending'?'Pendente':s==='done'?'Concluído':'Ignorado'}
                            </button>
                          ))}
                        </div>
                      </div>
                      {fuDetail.content&&(
                        <div>
                          <div style={{fontSize:9,fontWeight:600,color:'#4B5563',textTransform:'uppercase',letterSpacing:'0.12em',marginBottom:4}}>Mensagem inicial</div>
                          <div style={{fontSize:12,color:'#9CA3AF',lineHeight:1.5}}>{fuDetail.content}</div>
                        </div>
                      )}
                      <div style={{flex:1}}>
                        <div style={{fontSize:9,fontWeight:600,color:'#4B5563',textTransform:'uppercase',letterSpacing:'0.12em',marginBottom:8}}>Histórico de notas</div>
                        <div style={{display:'flex',flexDirection:'column',gap:8,maxHeight:200,overflowY:'auto'}}>
                          {(fuDetail.notes||[]).length===0&&<p style={{fontSize:11,color:'#374151'}}>Sem notas ainda.</p>}
                          {(fuDetail.notes||[]).map((n,i)=>(
                            <div key={i} style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.05)',borderRadius:8,padding:'8px 10px'}}>
                              <div style={{fontSize:11,color:'#D1D5DB',lineHeight:1.5}}>{n.text}</div>
                              <div style={{fontSize:9,color:'#374151',marginTop:4}}>{n.author} · {fmtDate(n.timestamp)}</div>
                            </div>
                          ))}
                        </div>
                        <div style={{display:'flex',gap:6,marginTop:10}}>
                          <input value={fuNote} onChange={e=>setFuNote(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')addFuNote(fuDetail)}} placeholder="Adicionar nota..." style={{...inp,flex:1,fontSize:11,padding:'7px 10px'}}/>
                          <button onClick={()=>addFuNote(fuDetail)} style={{padding:'7px 12px',borderRadius:7,border:'none',background:'rgba(229,62,62,0.15)',color:'#E53E3E',cursor:'pointer',fontSize:11,fontWeight:600}}>+</button>
                        </div>
                      </div>
                    </div>
                  )
                })()}
              </div>
            </div>
          )}

          {/* ── FINANCEIRO ── */}
          {panel==='financeiro'&&(
            <div style={{padding:28}}>
              <div style={{marginBottom:24}}>
                <h1 style={{fontSize:24,fontWeight:800,color:'#F9FAFB',letterSpacing:'-0.03em',margin:0}}>Financeiro</h1>
                <p style={{fontSize:13,color:'#6B7280',margin:'6px 0 0'}}>Receita, MRR, fluxo de caixa e inadimplência — visão consolidada</p>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:20}}>
                <KpiCard label="Receita Mensal" value="R$ 0" trend={0} wide/>
                <KpiCard label="MRR" value="R$ 0" trend={0} wide/>
                <KpiCard label="Margem" value="0%" trend={0}/>
                <KpiCard label="Abertura" value="R$ 0" trend={0} wide/>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:24}}>
                <KpiCard label="Fluxo de Caixa" value="R$ 0" trend={0} wide/>
                <KpiCard label="Ticket Médio" value="R$ 0" trend={0} wide/>
                <KpiCard label="LTV" value="R$ 0" trend={0} wide/>
                <KpiCard label="Churn" value="0%" trend={0}/>
              </div>
              <div style={{background:'rgba(10,10,10,0.75)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:12,padding:'20px 20px 12px',backdropFilter:'blur(12px)',marginBottom:16}}>
                <div style={{fontSize:11,fontWeight:600,color:'#6B7280',textTransform:'uppercase',letterSpacing:'0.12em',marginBottom:8}}>Receita Anual</div>
                <AreaChart data={monthlyRev} id="rev" height={100}/>
                <div style={{display:'flex',justifyContent:'space-between',marginTop:6}}>{monthLabels.map(m=><span key={m} style={{fontSize:9,color:'#374151'}}>{m}</span>)}</div>
              </div>
              <div style={{background:'rgba(10,10,10,0.75)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:12,backdropFilter:'blur(12px)'}}>
                <div style={{padding:'16px 20px',borderBottom:'1px solid rgba(255,255,255,0.06)',fontSize:13,fontWeight:600,color:'#F9FAFB'}}>Clientes em Operação</div>
                {leads.filter(l=>stageMap[l.stage_id]?.kanban==='operacao').length===0
                  ?<p style={{padding:36,textAlign:'center',color:'#4B5563',fontSize:13}}>Nenhum cliente em operação ainda. Feche um lead para vê-lo aqui.</p>
                  :<table style={{width:'100%',borderCollapse:'collapse'}}>
                    <thead><tr style={{borderBottom:'1px solid rgba(255,255,255,0.06)'}}>{['Cliente','Empresa','Etapa','Valor Est.','Ação'].map(h=><th key={h} style={{padding:'10px 20px',textAlign:'left',fontSize:10,fontWeight:600,color:'#4B5563',textTransform:'uppercase',letterSpacing:'0.12em'}}>{h}</th>)}</tr></thead>
                    <tbody>
                      {leads.filter(l=>stageMap[l.stage_id]?.kanban==='operacao').map((lead,idx,arr)=>(
                        <tr key={lead.id} style={{borderBottom:idx<arr.length-1?'1px solid rgba(255,255,255,0.04)':'none'}}>
                          <td style={{padding:'12px 20px',fontSize:13,fontWeight:500,color:'#F9FAFB'}}>{lead.name}</td>
                          <td style={{padding:'12px 20px',fontSize:12,color:'#9CA3AF'}}>{lead.company_name??'—'}</td>
                          <td style={{padding:'12px 20px'}}><span style={{fontSize:10,color:stageMap[lead.stage_id]?.color,background:`${stageMap[lead.stage_id]?.color}18`,padding:'2px 8px',borderRadius:999}}>{stageMap[lead.stage_id]?.name}</span></td>
                          <td style={{padding:'12px 20px',fontSize:12,color:'#D1D5DB'}}>{lead.estimated_budget??'—'}</td>
                          <td style={{padding:'12px 20px'}}><button onClick={()=>setDetailLead(lead)} style={{fontSize:11,padding:'4px 10px',borderRadius:6,background:'rgba(229,62,62,0.08)',border:'1px solid rgba(229,62,62,0.2)',color:'#E53E3E',cursor:'pointer'}}>Ver</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                }
              </div>
            </div>
          )}

          {/* ── INTEGRAÇÕES ── */}
          {panel==='integracoes'&&(
            <div style={{padding:28}}>
              <div style={{marginBottom:24}}>
                <h2 style={{fontSize:20,fontWeight:700,color:'#F9FAFB',margin:0}}>Integrações</h2>
                <p style={{fontSize:12,color:'#6B7280',margin:'4px 0 0'}}>Conecte suas ferramentas e plataformas</p>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:16}}>
                {[
                  {icon:'💬',name:'WhatsApp (Uazapi)',desc:'Número: +55 11 99217-0101',status:false,cat:'Comunicação'},
                  {icon:'🤖',name:'OpenAI GPT-4.1',desc:'Agente de qualificação e follow-up',status:false,cat:'IA'},
                  {icon:'🗄',name:'Supabase',desc:'Banco de dados e autenticação',status:true,cat:'Infraestrutura'},
                  {icon:'📱',name:'Meta Ads',desc:'Facebook e Instagram Ads',status:false,cat:'Marketing'},
                  {icon:'📊',name:'Google Analytics',desc:'Métricas do site',status:false,cat:'Analytics'},
                  {icon:'💳',name:'Asaas',desc:'Cobranças e pagamentos',status:false,cat:'Financeiro'},
                ].map((int,i)=>(
                  <div key={i} style={{background:'rgba(10,10,10,0.75)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:12,padding:'20px',display:'flex',alignItems:'center',gap:14,backdropFilter:'blur(12px)',transition:'border-color 0.2s'}}
                    onMouseEnter={e=>(e.currentTarget.style.borderColor='rgba(255,255,255,0.12)')}
                    onMouseLeave={e=>(e.currentTarget.style.borderColor='rgba(255,255,255,0.07)')}
                  >
                    <div style={{width:44,height:44,borderRadius:10,background:'#0D0D0D',border:'1px solid rgba(255,255,255,0.06)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:22,flexShrink:0}}>{int.icon}</div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:13,fontWeight:600,color:'#F9FAFB',marginBottom:2}}>{int.name}</div>
                      <div style={{fontSize:11,color:'#6B7280',marginBottom:2}}>{int.desc}</div>
                      <div style={{fontSize:10,color:'#374151'}}>{int.cat}</div>
                    </div>
                    <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:8}}>
                      <span style={{fontSize:10,fontWeight:600,color:int.status?'#10B981':'#4B5563',background:int.status?'rgba(16,185,129,0.1)':'rgba(255,255,255,0.05)',padding:'3px 10px',borderRadius:99}}>{int.status?'● Ativo':'○ Pendente'}</span>
                      {!int.status&&<button style={{fontSize:10,padding:'3px 10px',borderRadius:6,border:'1px solid rgba(229,62,62,0.3)',background:'rgba(229,62,62,0.08)',color:'#E53E3E',cursor:'pointer',fontWeight:500}}>Conectar</button>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── CONFIGURAÇÕES ── */}
          {panel==='configuracoes'&&(
            <div style={{padding:28}}>
              <div style={{marginBottom:24}}>
                <h2 style={{fontSize:20,fontWeight:700,color:'#F9FAFB',margin:0}}>Configurações</h2>
                <p style={{fontSize:12,color:'#6B7280',margin:'4px 0 0'}}>Perfil da agência e preferências do sistema</p>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
                <div style={{background:'rgba(10,10,10,0.75)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:12,padding:24,backdropFilter:'blur(12px)'}}>
                  <div style={{fontSize:13,fontWeight:600,color:'#F9FAFB',marginBottom:20}}>Perfil da Agência</div>
                  {[
                    {k:'Nome',v:'DROP AGENCY'},{k:'Responsável',v:'Camila Pacheco'},{k:'Cargo',v:'CEO'},
                    {k:'Horário',v:'08:00 – 19:00 (BRT)'},{k:'Ticket pontual',v:'R$ 1.200'},{k:'Ticket recorrente',v:'R$ 5.000+'},{k:'WhatsApp',v:'+55 11 99217-0101'},
                  ].map(({k,v})=>(
                    <div key={k} style={{marginBottom:14,paddingBottom:14,borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                      <div style={{fontSize:9,fontWeight:600,color:'#4B5563',textTransform:'uppercase',letterSpacing:'0.12em',marginBottom:3}}>{k}</div>
                      <div style={{fontSize:13,color:'#D1D5DB'}}>{v}</div>
                    </div>
                  ))}
                </div>
                <div style={{background:'rgba(10,10,10,0.75)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:12,padding:24,backdropFilter:'blur(12px)'}}>
                  <div style={{fontSize:13,fontWeight:600,color:'#F9FAFB',marginBottom:16}}>Pipeline — 3 Kanbans</div>
                  {['aquisicao','vendas','operacao'].map(k=>(
                    <div key={k} style={{marginBottom:16}}>
                      <div style={{fontSize:10,fontWeight:700,color:'#E53E3E',textTransform:'uppercase',letterSpacing:'0.12em',marginBottom:8}}>{KANBAN_LABELS[k]}</div>
                      {stages.filter(s=>s.kanban===k).map((s,i)=>(
                        <div key={s.id} style={{display:'flex',alignItems:'center',gap:8,padding:'7px 10px',background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.04)',borderRadius:7,marginBottom:4}}>
                          <span style={{fontSize:10,color:'#4B5563',minWidth:16,textAlign:'center'}}>{i+1}</span>
                          <span style={{width:7,height:7,borderRadius:'50%',background:s.color,flexShrink:0}}/>
                          <span style={{fontSize:12,color:'#D1D5DB',flex:1}}>{s.name}</span>
                          <span style={{fontSize:10,color:'#374151'}}>{leads.filter(l=>l.stage_id===s.id).length}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── PROJETOS ── */}
          {panel==='projetos'&&(
            <div style={{padding:28}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:24}}>
                <div>
                  <h2 style={{fontSize:20,fontWeight:700,color:'#F9FAFB',margin:0}}>{selectedProject?selectedProject.name:'Projetos'}</h2>
                  <p style={{fontSize:12,color:'#6B7280',margin:'4px 0 0'}}>{selectedProject?selectedProject.client_name??'':'Gerencie projetos por cliente, equipe e tarefas'}</p>
                </div>
                <div style={{display:'flex',gap:8}}>
                  {selectedProject&&<button onClick={()=>setSelectedProject(null)} style={{padding:'8px 14px',borderRadius:8,border:'1px solid rgba(255,255,255,0.1)',background:'transparent',color:'#D1D5DB',fontSize:12,cursor:'pointer'}}>← Voltar</button>}
                  {selectedProject
                    ?<button onClick={()=>setAddTaskModal({projectId:selectedProject.id})} style={{padding:'8px 16px',borderRadius:8,border:'none',fontSize:12,fontWeight:600,color:'#fff',cursor:'pointer',background:'linear-gradient(135deg,#E53E3E,#B91C1C)'}}>+ Nova Tarefa</button>
                    :<button onClick={()=>setAddProjectModal(true)} style={{padding:'8px 16px',borderRadius:8,border:'none',fontSize:12,fontWeight:600,color:'#fff',cursor:'pointer',background:'linear-gradient(135deg,#E53E3E,#B91C1C)'}}>+ Novo Projeto</button>
                  }
                </div>
              </div>

              {!selectedProject?(
                <>
                  {projects.length===0&&<div style={{textAlign:'center',padding:60,color:'#4B5563'}}><div style={{fontSize:40,marginBottom:12}}>📁</div><div style={{fontSize:14,fontWeight:600,color:'#6B7280'}}>Nenhum projeto ainda</div><div style={{fontSize:12,marginTop:4}}>Crie um projeto para cada cliente</div></div>}
                  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:16}}>
                    {projects.map(p=>{
                      const ptasks=tasks.filter(t=>t.project_id===p.id)
                      const done=ptasks.filter(t=>t.status==='done').length
                      const pct=ptasks.length>0?Math.round(done/ptasks.length*100):0
                      const statusColor:Record<string,string>={active:'#10B981',paused:'#F59E0B',completed:'#3B82F6',cancelled:'#6B7280'}
                      const statusLabel:Record<string,string>={active:'Ativo',paused:'Pausado',completed:'Concluído',cancelled:'Cancelado'}
                      return (
                        <div key={p.id} onClick={()=>setSelectedProject(p)} style={{background:'rgba(10,10,10,0.75)',border:`1px solid ${p.color}25`,borderRadius:12,padding:20,cursor:'pointer',backdropFilter:'blur(12px)',transition:'border-color 0.2s'}}
                          onMouseEnter={e=>(e.currentTarget.style.borderColor=`${p.color}50`)}
                          onMouseLeave={e=>(e.currentTarget.style.borderColor=`${p.color}25`)}
                        >
                          <div style={{display:'flex',justifyContent:'space-between',marginBottom:12}}>
                            <div style={{width:10,height:10,borderRadius:'50%',background:p.color,marginTop:4}}/>
                            <span style={{fontSize:10,fontWeight:600,color:statusColor[p.status]||'#6B7280',background:`${statusColor[p.status]||'#374151'}18`,padding:'2px 8px',borderRadius:99}}>{statusLabel[p.status]||p.status}</span>
                          </div>
                          <div style={{fontSize:15,fontWeight:700,color:'#F9FAFB',marginBottom:4}}>{p.name}</div>
                          <div style={{fontSize:12,color:'#6B7280',marginBottom:12}}>{p.client_name??'Sem cliente'}</div>
                          {p.description&&<div style={{fontSize:11,color:'#4B5563',marginBottom:12,lineHeight:1.5}}>{p.description}</div>}
                          <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'#6B7280',marginBottom:8}}>
                            <span>{ptasks.length} tarefas</span><span>{done} concluídas</span><span style={{color:p.color}}>{pct}%</span>
                          </div>
                          <div style={{height:3,background:'rgba(255,255,255,0.06)',borderRadius:999}}><div style={{height:'100%',width:`${pct}%`,background:p.color,borderRadius:999,transition:'width 0.5s'}}/></div>
                          {p.end_date&&<div style={{fontSize:10,color:'#4B5563',marginTop:8}}>Prazo: {fmtDateShort(p.end_date)}</div>}
                        </div>
                      )
                    })}
                  </div>
                </>
              ):(
                // Task kanban
                <div style={{display:'flex',gap:12,overflowX:'auto',paddingBottom:8}}>
                  {['todo','in_progress','review','done'].map(status=>{
                    const stLabel:Record<string,string>={todo:'A Fazer',in_progress:'Em Progresso',review:'Revisão',done:'Concluído'}
                    const stColor:Record<string,string>={todo:'#6B7280',in_progress:'#3B82F6',review:'#F59E0B',done:'#10B981'}
                    const col=tasks.filter(t=>t.project_id===selectedProject.id&&t.status===status)
                    return (
                      <div key={status} style={{width:260,flexShrink:0,background:'rgba(10,10,10,0.65)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:12,padding:12,minHeight:400,backdropFilter:'blur(10px)'}}
                        onDragOver={e=>e.preventDefault()}
                        onDrop={e=>{e.preventDefault();const id=e.dataTransfer.getData('taskId');if(id){const t=tasks.find(x=>x.id===id);if(t&&t.status!=='done')moveTask(id,status);else if(t&&status==='done'&&t.status!=='done')completeTask(t)}}}
                      >
                        <div style={{display:'flex',alignItems:'center',gap:7,marginBottom:12,paddingBottom:10,borderBottom:'1px solid rgba(255,255,255,0.05)'}}>
                          <span style={{width:7,height:7,borderRadius:'50%',background:TASK_ST_COLOR[status]}}/>
                          <span style={{fontSize:11,fontWeight:600,color:'#D1D5DB'}}>{TASK_ST_LABEL[status]}</span>
                          <span style={{marginLeft:'auto',fontSize:10,color:'#4B5563',background:'rgba(255,255,255,0.05)',padding:'1px 6px',borderRadius:99}}>{col.length}</span>
                        </div>
                        {col.map(task=>{
                          const m=members.find(x=>x.id===task.assigned_to)
                          return (
                            <div key={task.id} draggable onDragStart={e=>e.dataTransfer.setData('taskId',task.id)}
                              style={{background:'rgba(8,8,8,0.8)',border:'1px solid rgba(255,255,255,0.05)',borderRadius:9,padding:'10px 12px',marginBottom:7,backdropFilter:'blur(8px)'}}
                            >
                              <div style={{fontSize:12,fontWeight:600,color:'#F9FAFB',marginBottom:5}}>{task.title}</div>
                              {task.description&&<div style={{fontSize:10,color:'#6B7280',marginBottom:6,lineHeight:1.4}}>{task.description}</div>}
                              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                                <span style={{fontSize:9,fontWeight:600,color:priorityColor[task.priority],background:`${priorityColor[task.priority]}18`,padding:'2px 6px',borderRadius:99}}>{priorityLabel[task.priority]}</span>
                                <span style={{fontSize:9,color:'#E53E3E',fontWeight:700}}>+{task.xp_reward}XP</span>
                              </div>
                              {m&&<div style={{display:'flex',alignItems:'center',gap:5,marginTop:7}}>
                                <div style={{width:18,height:18,borderRadius:'50%',background:m.avatar_color,display:'flex',alignItems:'center',justifyContent:'center',fontSize:8,fontWeight:700,color:'#fff'}}>{m.name[0]}</div>
                                <span style={{fontSize:10,color:'#6B7280'}}>{m.name.split(' ')[0]}</span>
                              </div>}
                              {task.status!=='done'&&(
                                <button onClick={()=>completeTask(task)} style={{width:'100%',marginTop:7,padding:'4px',borderRadius:6,border:'1px solid rgba(16,185,129,0.3)',background:'rgba(16,185,129,0.08)',color:'#10B981',fontSize:10,cursor:'pointer',fontWeight:500}}>✓ Concluir</button>
                              )}
                            </div>
                          )
                        })}
                        {col.length===0&&<p style={{fontSize:11,color:'#374151',textAlign:'center',paddingTop:16}}>Vazio</p>}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── MARKETING ── */}
          {panel==='marketing'&&(
            <div style={{padding:28}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:24}}>
                <div>
                  <h2 style={{fontSize:20,fontWeight:700,color:'#F9FAFB',margin:0}}>Marketing</h2>
                  <p style={{fontSize:12,color:'#6B7280',margin:'4px 0 0'}}>Campanhas de tráfego pago — Meta Ads, Google Ads e mais</p>
                </div>
                <button onClick={()=>setAddCampaignModal(true)} style={{padding:'8px 16px',borderRadius:8,border:'none',fontSize:12,fontWeight:600,color:'#fff',cursor:'pointer',background:'linear-gradient(135deg,#E53E3E,#B91C1C)'}}>+ Nova Campanha</button>
              </div>

              {/* KPIs */}
              {campaigns.length>0&&(()=>{
                const totalSpend=campaigns.reduce((a,c)=>a+c.spend,0)
                const totalRev=campaigns.reduce((a,c)=>a+c.revenue,0)
                const totalLeadsGen=campaigns.reduce((a,c)=>a+c.leads_gen,0)
                const totalClicks=campaigns.reduce((a,c)=>a+c.clicks,0)
                const roas=totalSpend>0?(totalRev/totalSpend).toFixed(2):'—'
                const cpl=totalLeadsGen>0?(totalSpend/totalLeadsGen).toFixed(2):'—'
                return (
                  <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:24}}>
                    {[
                      {l:'Investimento Total',v:`R$ ${totalSpend.toLocaleString('pt-BR',{minimumFractionDigits:0})}`},
                      {l:'Receita Gerada',v:`R$ ${totalRev.toLocaleString('pt-BR',{minimumFractionDigits:0})}`},
                      {l:'ROAS',v:`${roas}x`},
                      {l:'CPL',v:cpl!=='—'?`R$ ${Number(cpl).toFixed(0)}`:'—'},
                    ].map((k,i)=>(
                      <div key={i} style={{background:'rgba(10,10,10,0.75)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:12,padding:'16px 18px',backdropFilter:'blur(12px)'}}>
                        <div style={{fontSize:10,fontWeight:600,color:'#6B7280',textTransform:'uppercase',letterSpacing:'0.12em',marginBottom:8}}>{k.l}</div>
                        <div style={{fontSize:22,fontWeight:800,color:'#F9FAFB',letterSpacing:'-0.03em'}}>{k.v}</div>
                      </div>
                    ))}
                  </div>
                )
              })()}

              {campaigns.length===0&&<div style={{textAlign:'center',padding:60,color:'#4B5563'}}><div style={{fontSize:40,marginBottom:12}}>📊</div><div style={{fontSize:14,fontWeight:600,color:'#6B7280'}}>Nenhuma campanha ainda</div><div style={{fontSize:12,marginTop:4}}>Adicione campanhas de Meta Ads, Google Ads e outros</div></div>}

              {/* Agrupado por plataforma */}
              {(['meta_ads','google_ads','tiktok_ads','linkedin_ads','other']).map(platform=>{
                const pl=campaigns.filter(c=>c.platform===platform)
                if(pl.length===0) return null
                return (
                  <div key={platform} style={{marginBottom:24}}>
                    <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12}}>
                      <div style={{width:28,height:28,borderRadius:7,background:platformColor[platform],display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:800,color:'#fff'}}>{platformIcon[platform]}</div>
                      <span style={{fontSize:14,fontWeight:600,color:'#F9FAFB'}}>{platformLabel[platform]}</span>
                      <span style={{fontSize:11,color:'#4B5563'}}>{pl.length} campanha{pl.length>1?'s':''}</span>
                    </div>
                    <div style={{display:'flex',flexDirection:'column',gap:8}}>
                      {pl.map(c=>{
                        const ctr=c.impressions>0?((c.clicks/c.impressions)*100).toFixed(2):0
                        const roas=c.spend>0?(c.revenue/c.spend).toFixed(2):0
                        const statusColor2:Record<string,string>={active:'#10B981',paused:'#F59E0B',ended:'#6B7280'}
                        const statusLabel2:Record<string,string>={active:'Ativo',paused:'Pausado',ended:'Encerrado'}
                        return (
                          <div key={c.id} style={{background:'rgba(10,10,10,0.75)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:12,padding:'16px 20px',backdropFilter:'blur(12px)'}}>
                            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:12}}>
                              <div>
                                <div style={{fontSize:13,fontWeight:600,color:'#F9FAFB'}}>{c.campaign_name}</div>
                                <div style={{fontSize:11,color:'#6B7280'}}>{c.client_name}</div>
                              </div>
                              <span style={{fontSize:10,fontWeight:600,color:statusColor2[c.status]||'#6B7280',background:`${statusColor2[c.status]||'#374151'}18`,padding:'2px 8px',borderRadius:99}}>{statusLabel2[c.status]||c.status}</span>
                            </div>
                            <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:8}}>
                              {[
                                {l:'Investido',v:`R$${c.spend.toLocaleString('pt-BR',{maximumFractionDigits:0})}`},
                                {l:'Impressões',v:c.impressions.toLocaleString('pt-BR')},
                                {l:'Cliques',v:c.clicks.toLocaleString('pt-BR')},
                                {l:'CTR',v:`${ctr}%`},
                                {l:'Leads',v:c.leads_gen},
                                {l:'ROAS',v:`${roas}x`},
                              ].map((m,i)=>(
                                <div key={i} style={{textAlign:'center'}}>
                                  <div style={{fontSize:9,color:'#4B5563',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:4}}>{m.l}</div>
                                  <div style={{fontSize:13,fontWeight:700,color:'#F9FAFB'}}>{m.v}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* ── EQUIPE ── */}
          {panel==='equipe'&&(
            <div style={{padding:28}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:20}}>
                <div>
                  <h2 style={{fontSize:20,fontWeight:700,color:'#F9FAFB',margin:0}}>Equipe</h2>
                  <p style={{fontSize:12,color:'#6B7280',margin:'4px 0 0'}}>{members.length} colaboradores ativos</p>
                </div>
                <div style={{display:'flex',gap:8}}>
                  <button onClick={()=>setAddMemberModal(true)} style={{padding:'8px 14px',borderRadius:8,border:'1px solid rgba(255,255,255,0.1)',background:'transparent',color:'#D1D5DB',fontSize:12,cursor:'pointer'}}>+ Membro</button>
                </div>
              </div>

              {/* Tabs */}
              <div style={{display:'flex',gap:4,marginBottom:24,borderBottom:'1px solid rgba(255,255,255,0.06)',paddingBottom:0}}>
                {(['membros','produtividade','xp','organograma'] as const).map((t)=>{const l={membros:'Membros',produtividade:'Produtividade',xp:'XP & Ranking',organograma:'Organograma'}[t]; return (
                  <button key={t} onClick={()=>setEquipeTab(t)} style={{padding:'8px 16px',borderRadius:'8px 8px 0 0',border:'none',fontSize:12,fontWeight:equipeTab===t?600:400,cursor:'pointer',background:equipeTab===t?'rgba(229,62,62,0.12)':'transparent',color:equipeTab===t?'#F9FAFB':'#6B7280',borderBottom:equipeTab===t?'2px solid #E53E3E':'2px solid transparent'}}>{l}</button>
                )})}
              </div>

              {/* ─ Tab Membros ─ */}
              {equipeTab==='membros'&&(
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))',gap:16}}>
                  {members.map(m=>{
                    const xp=memberXP.find(x=>x.member_id===m.id)
                    const lvl=xpForLevel(xp?.total_xp??0)
                    const prog=xpProgress(xp?.total_xp??0)
                    const mb2=memberBadges.filter(b=>b.member_id===m.id)
                    const memberTasks=tasks.filter(t=>t.assigned_to===m.id)
                    const done=memberTasks.filter(t=>t.status==='done').length
                    return (
                      <div key={m.id} style={{background:'rgba(10,10,10,0.75)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:12,padding:20,backdropFilter:'blur(12px)'}}>
                        <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:14}}>
                          <div style={{width:44,height:44,borderRadius:'50%',background:m.avatar_color,display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,fontWeight:700,color:'#fff',flexShrink:0,boxShadow:`0 0 16px ${m.avatar_color}40`}}>{m.name.split(' ').map((w:string)=>w[0]).join('').slice(0,2).toUpperCase()}</div>
                          <div style={{flex:1}}>
                            <div style={{fontSize:14,fontWeight:600,color:'#F9FAFB'}}>{m.name}</div>
                            <div style={{fontSize:11,color:'#6B7280'}}>{m.role}</div>
                          </div>
                          <div style={{textAlign:'right'}}>
                            <div style={{fontSize:11,fontWeight:700,color:'#E53E3E'}}>Nível {lvl}</div>
                            <div style={{fontSize:10,color:'#4B5563'}}>{xp?.total_xp??0} XP</div>
                          </div>
                        </div>
                        <div style={{marginBottom:10}}>
                          <div style={{display:'flex',justifyContent:'space-between',fontSize:9,color:'#4B5563',marginBottom:4}}><span>XP Progress</span><span>{prog}%</span></div>
                          <div style={{height:4,background:'rgba(255,255,255,0.06)',borderRadius:999}}><div style={{height:'100%',width:`${prog}%`,background:`linear-gradient(to right,#B91C1C,#E53E3E)`,borderRadius:999}}/></div>
                        </div>
                        <div style={{display:'flex',gap:6,marginBottom:10}}>
                          {[
                            {l:'Tarefas',v:memberTasks.length},
                            {l:'Concluídas',v:done},
                            {l:'Em andamento',v:memberTasks.filter(t=>t.status==='in_progress').length},
                          ].map((s,i)=>(
                            <div key={i} style={{flex:1,textAlign:'center',background:'rgba(255,255,255,0.03)',borderRadius:7,padding:'6px 0'}}>
                              <div style={{fontSize:14,fontWeight:700,color:'#F9FAFB'}}>{s.v}</div>
                              <div style={{fontSize:9,color:'#4B5563'}}>{s.l}</div>
                            </div>
                          ))}
                        </div>
                        {mb2.length>0&&(
                          <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                            {mb2.slice(0,4).map(mb3=>{
                              const b=badges.find(x=>x.id===mb3.badge_id)
                              return b?<span key={mb3.id} title={b.name} style={{fontSize:16}}>{b.icon}</span>:null
                            })}
                            {mb2.length>4&&<span style={{fontSize:10,color:'#4B5563',alignSelf:'center'}}>+{mb2.length-4}</span>}
                          </div>
                        )}
                      </div>
                    )
                  })}
                  {members.length===0&&<div style={{textAlign:'center',padding:60,color:'#4B5563',gridColumn:'1/-1'}}><div style={{fontSize:40,marginBottom:12}}>👥</div><div style={{fontSize:14,fontWeight:600,color:'#6B7280'}}>Nenhum membro ainda</div></div>}
                </div>
              )}

              {/* ─ Tab Produtividade ─ */}
              {equipeTab==='produtividade'&&(
                <div style={{display:'flex',flexDirection:'column',gap:12}}>
                  {members.map(m=>{
                    const mt=tasks.filter(t=>t.assigned_to===m.id)
                    const done=mt.filter(t=>t.status==='done').length
                    const inProg=mt.filter(t=>t.status==='in_progress').length
                    const review=mt.filter(t=>t.status==='review').length
                    const todo=mt.filter(t=>t.status==='todo').length
                    const pct=mt.length>0?Math.round(done/mt.length*100):0
                    const xp=memberXP.find(x=>x.member_id===m.id)
                    return (
                      <div key={m.id} style={{background:'rgba(10,10,10,0.75)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:12,padding:'16px 20px',backdropFilter:'blur(12px)',display:'flex',alignItems:'center',gap:16}}>
                        <div style={{width:40,height:40,borderRadius:'50%',background:m.avatar_color,display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,fontWeight:700,color:'#fff',flexShrink:0}}>{m.name.split(' ').map((w:string)=>w[0]).join('').slice(0,2)}</div>
                        <div style={{flex:1}}>
                          <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}>
                            <div>
                              <div style={{fontSize:13,fontWeight:600,color:'#F9FAFB'}}>{m.name}</div>
                              <div style={{fontSize:11,color:'#6B7280'}}>{m.role}</div>
                            </div>
                            <div style={{fontSize:22,fontWeight:800,color:'#F9FAFB'}}>{pct}%</div>
                          </div>
                          <div style={{height:5,background:'rgba(255,255,255,0.06)',borderRadius:999,marginBottom:8}}><div style={{height:'100%',width:`${pct}%`,background:'linear-gradient(to right,#B91C1C,#E53E3E)',borderRadius:999}}/></div>
                          <div style={{display:'flex',gap:12}}>
                            {[{l:'Total',v:mt.length,c:'#9CA3AF'},{l:'Concluído',v:done,c:'#10B981'},{l:'Em progresso',v:inProg,c:'#3B82F6'},{l:'Revisão',v:review,c:'#F59E0B'},{l:'A fazer',v:todo,c:'#6B7280'},{l:'XP Total',v:xp?.total_xp??0,c:'#E53E3E'}].map((s,i)=>(
                              <div key={i}><span style={{fontSize:10,color:'#4B5563'}}>{s.l}: </span><span style={{fontSize:11,fontWeight:700,color:s.c}}>{s.v}</span></div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  {members.length===0&&<div style={{textAlign:'center',padding:60,color:'#4B5563'}}><div style={{fontSize:40,marginBottom:12}}>📈</div><div style={{fontSize:14,fontWeight:600,color:'#6B7280'}}>Adicione membros para ver produtividade</div></div>}
                </div>
              )}

              {/* ─ Tab Organograma ─ */}
              {equipeTab==='organograma'&&(()=>{
                const fmtName = (n:string) => {
                  if(!n) return 'Usuário'
                  if(!n.includes('@')) return n
                  return n.split('@')[0].split(/[._\-+]/).map((w:string)=>w.charAt(0).toUpperCase()+w.slice(1).toLowerCase()).join(' ')
                }
                const getProfile = (memberId:string) => userProfiles.find(p=>p.member_id===memberId)
                const ceoName = fmtName(currentUser?.name??'Administradora')

                const isComercial = (role:string) => /comercial|vend|closer|sdr|account|prospect/i.test(role)
                const isAdmDept  = (role:string) => /financ|rh|recursos|jurídico|contab|secretar|administrativ/i.test(role)
                const deptOf = (m:TeamMember) => isComercial(m.role)?'comercial':isAdmDept(m.role)?'administrativo':'operacional'
                const byDept = (dept:string) => members.filter(m=>deptOf(m)===dept)
                const MAX_CAP = 8

                const hireNeed = (dept:string) => {
                  const mbs = byDept(dept)
                  if(mbs.length===0) return 100
                  const active = standaloneTasks.filter(t=>
                    mbs.some(m=>taskAssignees.some(a=>a.task_id===t.id&&a.member_id===m.id))&&t.status!=='done'
                  ).length
                  return Math.min(100,Math.max(0,Math.round((active/(mbs.length*MAX_CAP))*100)))
                }
                const needColor = (p:number) => p>=86?'#EF4444':p>=61?'#F59E0B':p>=31?'#3B82F6':'#10B981'
                const needLabel = (p:number) => p>=86?'Contratar urgente':p>=61?'Alta demanda':p>=31?'Atenção':'Capacidade OK'

                const DEPTS = [
                  {id:'operacional',   label:'Operacional',    color:'#3B82F6'},
                  {id:'comercial',     label:'Comercial',      color:'#10B981'},
                  {id:'administrativo',label:'Administrativo', color:'#F59E0B'},
                ]

                const avatarInitials = (name:string) =>
                  fmtName(name).split(' ').slice(0,2).map((w:string)=>w[0]).join('').toUpperCase()

                return (
                  <div style={{overflowX:'auto',paddingTop:28,paddingBottom:16,minWidth:560}}>

                    {/* ── CEO ── */}
                    <div style={{display:'flex',flexDirection:'column',alignItems:'center'}}>
                      <div style={{background:'rgba(12,12,12,0.95)',border:'1px solid rgba(229,62,62,0.35)',borderRadius:14,padding:'16px 24px',backdropFilter:'blur(16px)',display:'flex',alignItems:'center',gap:14,position:'relative',boxShadow:'0 0 32px rgba(229,62,62,0.12)'}}>
                        <div style={{position:'absolute',top:-10,right:14,background:'rgba(229,62,62,0.15)',border:'1px solid rgba(229,62,62,0.3)',borderRadius:999,padding:'2px 9px',fontSize:9,fontWeight:700,color:'#E53E3E',letterSpacing:'0.1em'}}>1 colaborador</div>
                        <div style={{width:46,height:46,borderRadius:'50%',background:'linear-gradient(135deg,#E53E3E,#991B1B)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,fontWeight:800,color:'#fff',boxShadow:'0 0 18px rgba(229,62,62,0.45)',flexShrink:0}}>
                          {ceoName.split(' ').slice(0,2).map((w:string)=>w[0]).join('').toUpperCase()}
                        </div>
                        <div>
                          <div style={{fontSize:13,fontWeight:700,color:'#F9FAFB',marginBottom:1}}>👑 {ceoName}</div>
                          <div style={{fontSize:11,color:'#E53E3E',fontWeight:600}}>Fundadora & CEO</div>
                        </div>
                      </div>

                      {/* linha vertical CEO → horizontal */}
                      <div style={{width:2,height:32,background:'rgba(255,255,255,0.1)'}}/>

                      {/* linha horizontal atravessando os 3 depts */}
                      <div style={{width:'80%',height:2,background:'rgba(255,255,255,0.1)',position:'relative'}}>
                        {DEPTS.map((_,i)=>(
                          <div key={i} style={{position:'absolute',top:0,left:`${(i*50)}%`,width:2,height:28,background:'rgba(255,255,255,0.1)',transform:'translateX(-50%)'}}/>
                        ))}
                      </div>
                    </div>

                    {/* ── DEPARTAMENTOS ── */}
                    <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:16,marginTop:28,width:'80%',margin:'28px auto 0'}}>
                      {DEPTS.map(dept=>{
                        const mbs = byDept(dept.id)
                        const need = hireNeed(dept.id)
                        const nc = needColor(need)
                        const nl = needLabel(need)
                        const isCamilaResp = dept.id==='comercial'||dept.id==='administrativo'
                        const total = mbs.length + (isCamilaResp&&mbs.length===0?1:0)

                        return (
                          <div key={dept.id} style={{background:'rgba(12,12,12,0.9)',border:`1px solid ${dept.color}22`,borderRadius:14,backdropFilter:'blur(12px)',overflow:'hidden',display:'flex',flexDirection:'column'}}>
                            {/* header */}
                            <div style={{padding:'12px 16px',borderBottom:`1px solid rgba(255,255,255,0.05)`,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                              <div style={{fontSize:13,fontWeight:700,color:'#F9FAFB'}}>{dept.label}</div>
                              <div style={{background:`${dept.color}18`,border:`1px solid ${dept.color}35`,borderRadius:999,padding:'2px 8px',fontSize:9,fontWeight:700,color:dept.color}}>{total} colaborador{total!==1?'es':''}</div>
                            </div>

                            {/* necessidade de contratar */}
                            <div style={{padding:'10px 16px',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
                                <span style={{fontSize:9,color:'#4B5563',textTransform:'uppercase',letterSpacing:'0.1em',fontWeight:600}}>Necessidade de contratar</span>
                                <span style={{fontSize:11,fontWeight:800,color:nc}}>{need}%</span>
                              </div>
                              <div style={{height:4,background:'rgba(255,255,255,0.06)',borderRadius:999}}>
                                <div style={{height:'100%',width:`${need}%`,background:nc,borderRadius:999}}/>
                              </div>
                              <div style={{fontSize:9,color:nc,marginTop:3,fontWeight:600}}>{nl}</div>
                            </div>

                            {/* membros */}
                            <div style={{padding:12,display:'flex',flexDirection:'column',gap:8,flex:1}}>
                              {/* Camila como responsável se dept vazio */}
                              {isCamilaResp&&mbs.length===0&&(
                                <div style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',background:'rgba(229,62,62,0.05)',border:'1px solid rgba(229,62,62,0.15)',borderRadius:10}}>
                                  <div style={{width:36,height:36,borderRadius:'50%',background:'linear-gradient(135deg,#E53E3E,#991B1B)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:800,color:'#fff',flexShrink:0}}>
                                    {ceoName.split(' ').slice(0,2).map((w:string)=>w[0]).join('').toUpperCase()}
                                  </div>
                                  <div style={{flex:1}}>
                                    <div style={{fontSize:12,fontWeight:600,color:'#F9FAFB'}}>{ceoName}</div>
                                    <div style={{fontSize:10,color:'#E53E3E'}}>Responsável atual</div>
                                  </div>
                                </div>
                              )}

                              {/* colaboradores do dept */}
                              {mbs.map(m=>{
                                const profile = getProfile(m.id)
                                const access = !!profile
                                const email = profile?.email ?? m.email ?? ''
                                return (
                                  <div key={m.id} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:10,transition:'border-color 0.15s',cursor:'default'}}
                                    onMouseEnter={e=>(e.currentTarget.style.borderColor='rgba(255,255,255,0.14)')}
                                    onMouseLeave={e=>(e.currentTarget.style.borderColor='rgba(255,255,255,0.06)')}>
                                    <div style={{width:36,height:36,borderRadius:'50%',background:m.avatar_color,display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:800,color:'#fff',flexShrink:0,boxShadow:`0 0 12px ${m.avatar_color}35`}}>
                                      {avatarInitials(m.name)}
                                    </div>
                                    <div style={{flex:1,minWidth:0}}>
                                      <div style={{fontSize:12,fontWeight:600,color:'#F9FAFB',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{fmtName(m.name)}</div>
                                      <div style={{fontSize:10,color:'#6B7280'}}>{m.role||'Colaborador'}</div>
                                    </div>
                                    <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:4,flexShrink:0}}>
                                      <div style={{width:7,height:7,borderRadius:'50%',background:access?'#10B981':'#4B5563'}} title={access?'Com acesso':'Sem acesso'}/>
                                      {currentUser?.role==='admin'&&(
                                        <button onClick={()=>{setOrgAccessModal(m);setOrgAccessForm({email,password:'',confirmPassword:''})}}
                                          style={{padding:'2px 6px',borderRadius:4,border:'1px solid rgba(255,255,255,0.08)',background:'transparent',color:'#6B7280',fontSize:8,cursor:'pointer',fontFamily:'Montserrat,sans-serif',fontWeight:600,whiteSpace:'nowrap'}}>
                                          {access?'⚙':'+ acesso'}
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                )
                              })}

                              {/* vaga em aberto */}
                              {mbs.length===0&&!isCamilaResp&&(
                                <div style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',border:'1px dashed rgba(255,255,255,0.08)',borderRadius:10,opacity:0.5}}>
                                  <div style={{width:36,height:36,borderRadius:'50%',border:'2px dashed rgba(255,255,255,0.12)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                                    <span style={{color:'#374151',fontSize:16}}>+</span>
                                  </div>
                                  <div>
                                    <div style={{fontSize:12,color:'#4B5563',fontWeight:600}}>Vaga em aberto</div>
                                    <div style={{fontSize:9,color:'#374151'}}>A contratar</div>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })()}

              {/* ─ Tab XP & Ranking ─ */}
              {equipeTab==='xp'&&(
                <div style={{display:'grid',gridTemplateColumns:'1.5fr 1fr',gap:16}}>
                  {/* Ranking */}
                  <div style={{background:'rgba(10,10,10,0.75)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:12,backdropFilter:'blur(12px)'}}>
                    <div style={{padding:'16px 20px',borderBottom:'1px solid rgba(255,255,255,0.06)',fontSize:13,fontWeight:600,color:'#F9FAFB'}}>🏆 Ranking Geral</div>
                    {[...members].sort((a,b)=>{
                      const xa=memberXP.find(x=>x.member_id===a.id)?.total_xp??0
                      const xb=memberXP.find(x=>x.member_id===b.id)?.total_xp??0
                      return xb-xa
                    }).map((m,rank)=>{
                      const xp=memberXP.find(x=>x.member_id===m.id)
                      const lvl=xpForLevel(xp?.total_xp??0)
                      const prog=xpProgress(xp?.total_xp??0)
                      const rankColors=['#FFD700','#C0C0C0','#CD7F32']
                      return (
                        <div key={m.id} style={{display:'flex',alignItems:'center',gap:12,padding:'14px 20px',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                          <div style={{width:24,height:24,borderRadius:'50%',background:rank<3?rankColors[rank]:'rgba(255,255,255,0.05)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:800,color:rank<3?'#000':'#6B7280',flexShrink:0}}>{rank+1}</div>
                          <div style={{width:36,height:36,borderRadius:'50%',background:m.avatar_color,display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:700,color:'#fff',flexShrink:0}}>{m.name.split(' ').map((w:string)=>w[0]).join('').slice(0,2)}</div>
                          <div style={{flex:1}}>
                            <div style={{fontSize:13,fontWeight:600,color:'#F9FAFB',marginBottom:2}}>{m.name}</div>
                            <div style={{height:3,background:'rgba(255,255,255,0.06)',borderRadius:999}}><div style={{height:'100%',width:`${prog}%`,background:m.avatar_color,borderRadius:999}}/></div>
                          </div>
                          <div style={{textAlign:'right',flexShrink:0}}>
                            <div style={{fontSize:12,fontWeight:700,color:'#E53E3E'}}>{xp?.total_xp??0} XP</div>
                            <div style={{fontSize:10,color:'#4B5563'}}>Nível {lvl}</div>
                          </div>
                        </div>
                      )
                    })}
                    {members.length===0&&<p style={{padding:24,textAlign:'center',color:'#4B5563',fontSize:12}}>Nenhum membro ainda.</p>}
                  </div>

                  {/* Badges */}
                  <div style={{display:'flex',flexDirection:'column',gap:12}}>
                    <div style={{background:'rgba(10,10,10,0.75)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:12,padding:20,backdropFilter:'blur(12px)'}}>
                      <div style={{fontSize:13,fontWeight:600,color:'#F9FAFB',marginBottom:16}}>🏅 Selos Disponíveis</div>
                      <div style={{display:'flex',flexDirection:'column',gap:8}}>
                        {badges.map(b=>(
                          <div key={b.id} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 10px',background:'rgba(255,255,255,0.02)',borderRadius:8}}>
                            <span style={{fontSize:20}}>{b.icon}</span>
                            <div style={{flex:1}}>
                              <div style={{fontSize:12,fontWeight:600,color:'#F9FAFB'}}>{b.name}</div>
                              <div style={{fontSize:10,color:'#4B5563'}}>{b.description}</div>
                            </div>
                            <div style={{textAlign:'right',fontSize:9,color:'#374151'}}>
                              {b.required_xp>0&&<div>{b.required_xp}XP</div>}
                              {b.required_tasks>0&&<div>{b.required_tasks} tarefas</div>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── TAREFAS ── */}
          {panel==='tarefas'&&(
              <div style={{padding:28}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:20,flexWrap:'wrap',gap:12}}>
                  <div>
                    <h2 style={{fontSize:20,fontWeight:700,color:'#F9FAFB',margin:0}}>Tarefas</h2>
                    <p style={{fontSize:12,color:'#6B7280',margin:'4px 0 0'}}>Central operacional — gerencie entregas por colaborador e cliente</p>
                  </div>
                  <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
                    {/* Period filter */}
                    <div style={{display:'flex',gap:4,background:'rgba(10,10,10,0.6)',borderRadius:8,padding:3,border:'1px solid rgba(255,255,255,0.07)'}}>
                      {Object.entries(PERIOD_LABELS).map(([k,v])=>(
                        <button key={k} onClick={()=>setTaskPeriod(k as typeof taskPeriod)} style={{padding:'4px 10px',borderRadius:6,border:'none',fontSize:11,fontWeight:600,cursor:'pointer',background:taskPeriod===k?'rgba(229,62,62,0.2)':'transparent',color:taskPeriod===k?'#E53E3E':'#6B7280'}}>{v}</button>
                      ))}
                    </div>
                    {/* View toggle */}
                    <div style={{display:'flex',gap:4,background:'rgba(10,10,10,0.6)',borderRadius:8,padding:3,border:'1px solid rgba(255,255,255,0.07)'}}>
                      {(['dashboard','kanban','lista'] as const).map((v)=>{const ic={dashboard:'⊞',kanban:'▦',lista:'≡'}[v]; return (
                        <button key={v} onClick={()=>setTaskView(v)} style={{padding:'4px 10px',borderRadius:6,border:'none',fontSize:12,cursor:'pointer',background:taskView===v?'rgba(229,62,62,0.2)':'transparent',color:taskView===v?'#E53E3E':'#6B7280'}}>{ic}</button>
                      )})}
                    </div>
                    <button onClick={()=>setAddTaskStandaloneModal(true)} style={{padding:'8px 16px',borderRadius:8,border:'none',fontSize:12,fontWeight:600,color:'#fff',cursor:'pointer',background:'linear-gradient(135deg,#E53E3E,#B91C1C)'}}>+ Nova Tarefa</button>
                  </div>
                </div>

                {/* KPIs */}
                <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:10,marginBottom:20}}>
                  {[
                    {l:'Total',v:periodTasks.length,c:'#F9FAFB'},
                    {l:'Não iniciada',v:taskTodo,c:'#6B7280'},
                    {l:'Em andamento',v:taskInProg,c:'#3B82F6'},
                    {l:'Em revisão',v:taskReview,c:'#F59E0B'},
                    {l:'Concluída',v:taskDone,c:'#10B981'},
                    {l:'Atrasada',v:taskOverdue,c:'#EF4444'},
                  ].map((m,i)=>(
                    <div key={i} style={{background:'rgba(10,10,10,0.75)',border:`1px solid ${m.c}20`,borderRadius:10,padding:'14px 16px',backdropFilter:'blur(12px)'}}>
                      <div style={{fontSize:22,fontWeight:800,color:m.c,letterSpacing:'-0.03em'}}>{m.v}</div>
                      <div style={{fontSize:10,color:'#6B7280',marginTop:4,textTransform:'uppercase',letterSpacing:'0.1em'}}>{m.l}</div>
                    </div>
                  ))}
                </div>

                {/* Dashboard view */}
                {taskView==='dashboard'&&(
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
                    {/* Por colaborador */}
                    <div style={{background:'rgba(10,10,10,0.75)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:12,backdropFilter:'blur(12px)'}}>
                      <div style={{padding:'14px 20px',borderBottom:'1px solid rgba(255,255,255,0.06)',fontSize:13,fontWeight:600,color:'#F9FAFB'}}>Por Colaborador</div>
                      {members.length===0&&<p style={{padding:24,textAlign:'center',color:'#4B5563',fontSize:12}}>Nenhum membro cadastrado.</p>}
                      {members.map(m=>{
                        const mids=taskAssignees.filter(a=>a.member_id===m.id).map(a=>a.task_id)
                        const mt=periodTasks.filter(t=>mids.includes(t.id))
                        const mdone=mt.filter(t=>t.status==='done').length
                        const mover=mt.filter(t=>isOverdue(t)).length
                        const score=productivityScore(mdone,mt.length,mover)
                        const xp=memberXP.find(x=>x.member_id===m.id)
                        return (
                          <div key={m.id} style={{display:'flex',alignItems:'center',gap:12,padding:'12px 20px',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                            <div style={{width:32,height:32,borderRadius:'50%',background:m.avatar_color,display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,color:'#fff',flexShrink:0}}>{m.name.split(' ').map((w:string)=>w[0]).join('').slice(0,2)}</div>
                            <div style={{flex:1}}>
                              <div style={{fontSize:12,fontWeight:600,color:'#F9FAFB',marginBottom:2}}>{m.name}</div>
                              <div style={{height:3,background:'rgba(255,255,255,0.06)',borderRadius:999}}><div style={{height:'100%',width:`${score}%`,background:prodColor(score),borderRadius:999}}/></div>
                            </div>
                            <div style={{textAlign:'right',minWidth:60}}>
                              <div style={{fontSize:11,fontWeight:700,color:prodColor(score)}}>{prodLabel(score)}</div>
                              <div style={{fontSize:10,color:'#4B5563'}}>{mdone}/{mt.length} tarefas</div>
                            </div>
                            <div style={{fontSize:11,fontWeight:700,color:'#E53E3E',minWidth:60,textAlign:'right'}}>{xp?.total_xp??0}XP</div>
                          </div>
                        )
                      })}
                    </div>

                    {/* Por cliente */}
                    <div style={{background:'rgba(10,10,10,0.75)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:12,backdropFilter:'blur(12px)'}}>
                      <div style={{padding:'14px 20px',borderBottom:'1px solid rgba(255,255,255,0.06)',fontSize:13,fontWeight:600,color:'#F9FAFB'}}>Por Cliente</div>
                      {periodTasks.filter(t=>t.lead_id).length===0&&<p style={{padding:24,textAlign:'center',color:'#4B5563',fontSize:12}}>Nenhuma tarefa vinculada a cliente.</p>}
                      {Array.from(new Set(periodTasks.filter(t=>t.lead_id).map(t=>t.lead_id))).map(lid=>{
                        const lead=leads.find(l=>l.id===lid)
                        const lt=periodTasks.filter(t=>t.lead_id===lid)
                        const ldone=lt.filter(t=>t.status==='done').length
                        const lover=lt.filter(t=>isOverdue(t)).length
                        return (
                          <div key={lid!} style={{display:'flex',alignItems:'center',gap:12,padding:'12px 20px',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                            <div style={{flex:1}}>
                              <div style={{fontSize:12,fontWeight:600,color:'#F9FAFB'}}>{lead?.name??'—'}</div>
                              <div style={{fontSize:10,color:'#6B7280'}}>{lead?.company_name??lead?.niche??'—'}</div>
                            </div>
                            <div style={{display:'flex',gap:8,fontSize:11}}>
                              <span style={{color:'#10B981'}}>{ldone} ✓</span>
                              <span style={{color:'#6B7280'}}>{lt.length-ldone} pendentes</span>
                              {lover>0&&<span style={{color:'#EF4444'}}>{lover} atrasada{lover>1?'s':''}</span>}
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {/* Lista recente */}
                    <div style={{gridColumn:'1/-1',background:'rgba(10,10,10,0.75)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:12,backdropFilter:'blur(12px)'}}>
                      <div style={{padding:'14px 20px',borderBottom:'1px solid rgba(255,255,255,0.06)',fontSize:13,fontWeight:600,color:'#F9FAFB'}}>Tarefas Recentes — {PERIOD_LABELS[taskPeriod]}</div>
                      {periodTasks.length===0&&<p style={{padding:36,textAlign:'center',color:'#4B5563',fontSize:13}}>Nenhuma tarefa no período. Clique em + Nova Tarefa para começar.</p>}
                      <table style={{width:'100%',borderCollapse:'collapse'}}>
                        <tbody>
                          {periodTasks.slice(0,15).map((t,idx)=>{
                            const assignedIds=taskAssignees.filter(a=>a.task_id===t.id).map(a=>a.member_id)
                            const assignedMembers=members.filter(m=>assignedIds.includes(m.id))
                            const lead=leads.find(l=>l.id===t.lead_id)
                            const od=isOverdue(t)
                            return (
                              <tr key={t.id} style={{borderBottom:idx<periodTasks.length-1?'1px solid rgba(255,255,255,0.04)':'none'}}>
                                <td style={{padding:'11px 20px',width:32}}>
                                  <div style={{width:10,height:10,borderRadius:'50%',background:TASK_ST_COLOR[t.status]||'#6B7280'}}/>
                                </td>
                                <td style={{padding:'11px 8px',minWidth:200}}>
                                  <div style={{fontSize:13,fontWeight:500,color:'#F9FAFB'}}>{t.title}</div>
                                  {lead&&<div style={{fontSize:10,color:'#6B7280'}}>{lead.name}</div>}
                                </td>
                                <td style={{padding:'11px 8px'}}>
                                  <span style={{fontSize:9,fontWeight:600,color:priorityColor[t.priority],background:`${priorityColor[t.priority]}18`,padding:'2px 7px',borderRadius:99,textTransform:'uppercase'}}>{priorityLabel[t.priority]}</span>
                                </td>
                                <td style={{padding:'11px 8px'}}>
                                  <span style={{fontSize:10,fontWeight:500,color:TASK_ST_COLOR[t.status]||'#6B7280'}}>{TASK_ST_LABEL[t.status]||t.status}</span>
                                </td>
                                <td style={{padding:'11px 8px'}}>
                                  <div style={{display:'flex',gap:4}}>
                                    {assignedMembers.slice(0,3).map(m=><div key={m.id} title={m.name} style={{width:22,height:22,borderRadius:'50%',background:m.avatar_color,display:'flex',alignItems:'center',justifyContent:'center',fontSize:8,fontWeight:700,color:'#fff'}}>{m.name[0]}</div>)}
                                  </div>
                                </td>
                                <td style={{padding:'11px 20px',textAlign:'right'}}>
                                  {t.due_date&&<span style={{fontSize:10,color:od?'#EF4444':'#6B7280'}}>{od?'⚠ ':''}{fmtDateShort(t.due_date)}</span>}
                                </td>
                                <td style={{padding:'11px 20px'}}>
                                  {t.status!=='done'&&t.status!=='cancelled'&&(
                                    <button onClick={()=>moveStandaloneTask(t.id,'done')} style={{fontSize:10,padding:'3px 8px',borderRadius:6,border:'1px solid rgba(16,185,129,0.3)',background:'rgba(16,185,129,0.08)',color:'#10B981',cursor:'pointer'}}>✓ Concluir</button>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Kanban view */}
                {taskView==='kanban'&&(
                  <div style={{display:'flex',gap:12,overflowX:'auto',paddingBottom:8}}>
                    {(['todo','in_progress','review','done','cancelled']).map(status=>{
                      const col=periodTasks.filter(t=>t.status===status)
                      return (
                        <div key={status} style={{width:250,flexShrink:0,background:'rgba(10,10,10,0.65)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:12,padding:12,minHeight:400,backdropFilter:'blur(10px)'}}
                          onDragOver={e=>e.preventDefault()}
                          onDrop={e=>{e.preventDefault();const id=e.dataTransfer.getData('staskId');if(id)moveStandaloneTask(id,status)}}
                        >
                          <div style={{display:'flex',alignItems:'center',gap:7,marginBottom:12,paddingBottom:10,borderBottom:'1px solid rgba(255,255,255,0.05)'}}>
                            <span style={{width:7,height:7,borderRadius:'50%',background:TASK_ST_COLOR[status]}}/>
                            <span style={{fontSize:11,fontWeight:600,color:'#D1D5DB',flex:1}}>{TASK_ST_LABEL[status]}</span>
                            <span style={{fontSize:10,color:'#4B5563',background:'rgba(255,255,255,0.05)',padding:'1px 6px',borderRadius:99}}>{col.length}</span>
                          </div>
                          {col.map(t=>{
                            const assignedIds=taskAssignees.filter(a=>a.task_id===t.id).map(a=>a.member_id)
                            const am=members.filter(m=>assignedIds.includes(m.id))
                            const od=isOverdue(t)
                            return (
                              <div key={t.id} draggable onDragStart={e=>e.dataTransfer.setData('staskId',t.id)}
                                style={{background:'rgba(8,8,8,0.8)',border:`1px solid ${od?'rgba(239,68,68,0.3)':'rgba(255,255,255,0.05)'}`,borderRadius:9,padding:'10px 12px',marginBottom:7}}
                              >
                                <div style={{fontSize:12,fontWeight:600,color:'#F9FAFB',marginBottom:4}}>{t.title}</div>
                                {t.description&&<div style={{fontSize:10,color:'#6B7280',marginBottom:6,lineHeight:1.4}}>{t.description.slice(0,60)}{t.description.length>60?'...':''}</div>}
                                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:od?4:0}}>
                                  <span style={{fontSize:9,fontWeight:600,color:priorityColor[t.priority],background:`${priorityColor[t.priority]}18`,padding:'2px 6px',borderRadius:99}}>{priorityLabel[t.priority]}</span>
                                  <span style={{fontSize:9,color:'#E53E3E',fontWeight:700}}>+{t.xp_reward}XP</span>
                                </div>
                                {od&&<div style={{fontSize:9,color:'#EF4444',marginBottom:4}}>⚠ Atrasada — {fmtDateShort(t.due_date!)}</div>}
                                {am.length>0&&<div style={{display:'flex',gap:4,marginTop:6}}>
                                  {am.map(m=><div key={m.id} title={m.name} style={{width:18,height:18,borderRadius:'50%',background:m.avatar_color,display:'flex',alignItems:'center',justifyContent:'center',fontSize:8,fontWeight:700,color:'#fff'}}>{m.name[0]}</div>)}
                                </div>}
                              </div>
                            )
                          })}
                          {col.length===0&&<p style={{fontSize:11,color:'#374151',textAlign:'center',paddingTop:20}}>Vazio</p>}
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Lista view */}
                {taskView==='lista'&&(
                  <div style={{background:'rgba(10,10,10,0.75)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:12,backdropFilter:'blur(12px)'}}>
                    {periodTasks.length===0&&<p style={{padding:36,textAlign:'center',color:'#4B5563',fontSize:13}}>Nenhuma tarefa no período.</p>}
                    <table style={{width:'100%',borderCollapse:'collapse'}}>
                      <thead><tr style={{borderBottom:'1px solid rgba(255,255,255,0.06)'}}>{['Tarefa','Prioridade','Status','Responsáveis','Prazo','XP','Ação'].map(h=><th key={h} style={{padding:'11px 16px',textAlign:'left',fontSize:10,fontWeight:600,color:'#4B5563',textTransform:'uppercase',letterSpacing:'0.1em'}}>{h}</th>)}</tr></thead>
                      <tbody>
                        {periodTasks.map((t,idx)=>{
                          const ais=taskAssignees.filter(a=>a.task_id===t.id).map(a=>a.member_id)
                          const am=members.filter(m=>ais.includes(m.id))
                          const od=isOverdue(t)
                          return (
                            <tr key={t.id} style={{borderBottom:idx<periodTasks.length-1?'1px solid rgba(255,255,255,0.04)':'none'}}>
                              <td style={{padding:'11px 16px'}}>
                                <div style={{fontSize:13,fontWeight:500,color:'#F9FAFB'}}>{t.title}</div>
                                {t.description&&<div style={{fontSize:10,color:'#4B5563'}}>{t.description.slice(0,50)}{t.description.length>50?'...':''}</div>}
                              </td>
                              <td style={{padding:'11px 8px'}}><span style={{fontSize:9,fontWeight:600,color:priorityColor[t.priority],background:`${priorityColor[t.priority]}18`,padding:'2px 7px',borderRadius:99}}>{priorityLabel[t.priority]}</span></td>
                              <td style={{padding:'11px 8px'}}><span style={{fontSize:10,color:TASK_ST_COLOR[t.status]}}>{TASK_ST_LABEL[t.status]}</span></td>
                              <td style={{padding:'11px 8px'}}><div style={{display:'flex',gap:4}}>{am.slice(0,3).map(m=><div key={m.id} title={m.name} style={{width:22,height:22,borderRadius:'50%',background:m.avatar_color,display:'flex',alignItems:'center',justifyContent:'center',fontSize:8,fontWeight:700,color:'#fff'}}>{m.name[0]}</div>)}</div></td>
                              <td style={{padding:'11px 8px',fontSize:11,color:od?'#EF4444':'#6B7280'}}>{t.due_date?fmtDateShort(t.due_date):'—'}</td>
                              <td style={{padding:'11px 8px',fontSize:11,fontWeight:700,color:'#E53E3E'}}>+{t.xp_reward}</td>
                              <td style={{padding:'11px 16px'}}>
                                {t.status!=='done'&&t.status!=='cancelled'&&<button onClick={()=>moveStandaloneTask(t.id,'done')} style={{fontSize:10,padding:'3px 8px',borderRadius:6,border:'1px solid rgba(16,185,129,0.3)',background:'rgba(16,185,129,0.08)',color:'#10B981',cursor:'pointer'}}>✓</button>}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

          {/* ── ADMINISTRAÇÃO ── */}
          {panel==='administracao'&&(
            <div style={{padding:28}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:20}}>
                <div>
                  <h2 style={{fontSize:20,fontWeight:700,color:'#F9FAFB',margin:0}}>Administração</h2>
                  <p style={{fontSize:12,color:'#6B7280',margin:'4px 0 0'}}>Gestão de usuários, permissões e auditoria — acesso restrito a administradores</p>
                </div>
                {adminTab==='usuarios'&&<button onClick={()=>setCreateUserModal(true)} style={{padding:'8px 16px',borderRadius:8,border:'none',fontSize:12,fontWeight:600,color:'#fff',cursor:'pointer',background:'linear-gradient(135deg,#E53E3E,#B91C1C)'}}>+ Novo Usuário</button>}
              </div>

              {/* Tabs */}
              <div style={{display:'flex',gap:4,marginBottom:24,borderBottom:'1px solid rgba(255,255,255,0.06)'}}>
                {(['usuarios','permissoes','auditoria'] as const).map((t)=>{const l={usuarios:'👤 Usuários',permissoes:'🔐 Permissões',auditoria:'📋 Auditoria'}[t]; return (
                  <button key={t} onClick={()=>setAdminTab(t)} style={{padding:'8px 18px',borderRadius:'8px 8px 0 0',border:'none',fontSize:12,fontWeight:adminTab===t?600:400,cursor:'pointer',background:adminTab===t?'rgba(229,62,62,0.12)':'transparent',color:adminTab===t?'#F9FAFB':'#6B7280',borderBottom:adminTab===t?'2px solid #E53E3E':'2px solid transparent'}}>{l}</button>
                )})}
              </div>

              {/* Usuários */}
              {adminTab==='usuarios'&&(
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))',gap:16}}>
                  {userProfiles.map(u=>{
                    const roleColor:{[k:string]:string}={admin:'#E53E3E',gestor:'#F59E0B',colaborador:'#3B82F6'}
                    const roleLabel:{[k:string]:string}={admin:'Administrador',gestor:'Gestor',colaborador:'Colaborador'}
                    const permCount=Object.values(u.permissions||{}).filter(Boolean).length
                    const linked=members.find(m=>m.id===u.member_id)
                    return (
                      <div key={u.id} style={{background:'rgba(10,10,10,0.75)',border:`1px solid ${u.is_active?'rgba(255,255,255,0.07)':'rgba(255,255,255,0.03)'}`,borderRadius:12,padding:20,backdropFilter:'blur(12px)',opacity:u.is_active?1:0.6}}>
                        <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:14}}>
                          <div style={{width:42,height:42,borderRadius:'50%',background:linked?linked.avatar_color:'rgba(229,62,62,0.2)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,fontWeight:700,color:'#fff',flexShrink:0}}>{u.name.slice(0,2).toUpperCase()}</div>
                          <div style={{flex:1}}>
                            <div style={{fontSize:14,fontWeight:600,color:'#F9FAFB'}}>{u.name}</div>
                            <div style={{fontSize:11,color:'#6B7280'}}>{u.email}</div>
                          </div>
                          <span style={{fontSize:10,fontWeight:700,color:roleColor[u.role]||'#6B7280',background:`${roleColor[u.role]||'#374151'}18`,padding:'3px 8px',borderRadius:99}}>{roleLabel[u.role]||u.role}</span>
                        </div>
                        {linked&&<div style={{fontSize:11,color:'#6B7280',marginBottom:8}}>🔗 {linked.name} — {linked.role}</div>}
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
                          <span style={{fontSize:11,color:'#4B5563'}}>{permCount} módulos liberados</span>
                          <span style={{fontSize:10,color:u.is_active?'#10B981':'#6B7280'}}>{u.is_active?'● Ativo':'○ Inativo'}</span>
                        </div>
                        {u.last_login_at&&<div style={{fontSize:10,color:'#374151',marginBottom:12}}>Último acesso: {fmtDate(u.last_login_at)}</div>}
                        <div style={{display:'flex',gap:6}}>
                          <button onClick={()=>setEditPermUser({...u})} style={{flex:1,padding:'6px',borderRadius:7,border:'1px solid rgba(255,255,255,0.08)',background:'rgba(255,255,255,0.03)',color:'#D1D5DB',fontSize:11,cursor:'pointer'}}>Editar</button>
                          <button onClick={async()=>{const res=await fetch('/api/admin/create-user',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:u.id,is_active:!u.is_active})});if((await res.json()).success){setToast(u.is_active?'Usuário desativado':'Usuário reativado');fetchAll()}}} style={{flex:1,padding:'6px',borderRadius:7,border:`1px solid ${u.is_active?'rgba(239,68,68,0.3)':'rgba(16,185,129,0.3)'}`,background:u.is_active?'rgba(239,68,68,0.06)':'rgba(16,185,129,0.06)',color:u.is_active?'#EF4444':'#10B981',fontSize:11,cursor:'pointer'}}>{u.is_active?'Desativar':'Reativar'}</button>
                        </div>
                      </div>
                    )
                  })}
                  {userProfiles.length===0&&<div style={{gridColumn:'1/-1',textAlign:'center',padding:60,color:'#4B5563'}}><div style={{fontSize:40,marginBottom:12}}>👤</div><div style={{fontSize:14,fontWeight:600,color:'#6B7280'}}>Nenhum usuário cadastrado</div></div>}
                </div>
              )}

              {/* Permissões */}
              {adminTab==='permissoes'&&(
                <div style={{display:'grid',gridTemplateColumns:'1fr 1.5fr',gap:16}}>
                  <div style={{background:'rgba(10,10,10,0.75)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:12,backdropFilter:'blur(12px)'}}>
                    <div style={{padding:'14px 20px',borderBottom:'1px solid rgba(255,255,255,0.06)',fontSize:13,fontWeight:600,color:'#F9FAFB'}}>Selecione o usuário</div>
                    {userProfiles.map(u=>(
                      <div key={u.id} onClick={()=>setEditPermUser({...u})} style={{display:'flex',alignItems:'center',gap:10,padding:'12px 20px',borderBottom:'1px solid rgba(255,255,255,0.04)',cursor:'pointer',background:editPermUser?.id===u.id?'rgba(229,62,62,0.08)':'transparent',transition:'background 0.15s'}}>
                        <div style={{width:32,height:32,borderRadius:'50%',background:'rgba(229,62,62,0.15)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,color:'#E53E3E'}}>{u.name.slice(0,2).toUpperCase()}</div>
                        <div style={{flex:1}}>
                          <div style={{fontSize:13,fontWeight:500,color:'#F9FAFB'}}>{u.name}</div>
                          <div style={{fontSize:10,color:'#6B7280'}}>{u.role}</div>
                        </div>
                        <span style={{fontSize:10,color:'#4B5563'}}>{Object.values(u.permissions||{}).filter(Boolean).length} módulos</span>
                      </div>
                    ))}
                  </div>
                  {editPermUser?(
                    <div style={{background:'rgba(10,10,10,0.75)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:12,padding:20,backdropFilter:'blur(12px)'}}>
                      <div style={{fontSize:14,fontWeight:600,color:'#F9FAFB',marginBottom:4}}>{editPermUser.name}</div>
                      <div style={{marginBottom:16}}>
                        <label style={{fontSize:10,fontWeight:600,color:'#4B5563',textTransform:'uppercase',letterSpacing:'0.12em',display:'block',marginBottom:8}}>Nível de acesso</label>
                        <div style={{display:'flex',gap:8}}>
                          {(['admin','gestor','colaborador']).map(r=>(
                            <button key={r} onClick={()=>setEditPermUser(p=>p?{...p,role:r}:p)} style={{flex:1,padding:'6px',borderRadius:7,border:'1px solid',fontSize:11,fontWeight:600,cursor:'pointer',background:editPermUser.role===r?'rgba(229,62,62,0.15)':'transparent',color:editPermUser.role===r?'#E53E3E':'#6B7280',borderColor:editPermUser.role===r?'rgba(229,62,62,0.4)':'rgba(255,255,255,0.08)'}}>{r.charAt(0).toUpperCase()+r.slice(1)}</button>
                          ))}
                        </div>
                      </div>
                      <div style={{marginBottom:16}}>
                        <label style={{fontSize:10,fontWeight:600,color:'#4B5563',textTransform:'uppercase',letterSpacing:'0.12em',display:'block',marginBottom:10}}>Módulos liberados</label>
                        <div style={{display:'flex',flexDirection:'column',gap:8}}>
                          {ALL_MODULES.map(mod=>(
                            <label key={mod} style={{display:'flex',alignItems:'center',gap:10,cursor:'pointer',padding:'8px 10px',background:'rgba(255,255,255,0.02)',borderRadius:7,border:'1px solid rgba(255,255,255,0.04)'}}>
                              <div onClick={()=>setEditPermUser(p=>p?{...p,permissions:{...p.permissions,[mod]:!(p.permissions as Record<string,boolean>)[mod]}}:p)} style={{width:18,height:18,borderRadius:4,background:editPermUser.permissions?.[mod]?'#E53E3E':'rgba(255,255,255,0.06)',border:`1px solid ${editPermUser.permissions?.[mod]?'#E53E3E':'rgba(255,255,255,0.12)'}`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,cursor:'pointer'}}>
                                {editPermUser.permissions?.[mod]&&<svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 5l2.5 2.5L8 3" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" fill="none"/></svg>}
                              </div>
                              <span style={{fontSize:12,color:'#D1D5DB'}}>{MODULE_LABELS[mod]}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                      <button onClick={()=>savePermissions(editPermUser)} style={{width:'100%',padding:'10px',borderRadius:8,border:'none',fontSize:13,fontWeight:600,color:'#fff',cursor:'pointer',background:'linear-gradient(135deg,#E53E3E,#B91C1C)'}}>Salvar Permissões</button>
                    </div>
                  ):(
                    <div style={{display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(10,10,10,0.5)',borderRadius:12,border:'1px solid rgba(255,255,255,0.06)',color:'#4B5563',fontSize:13}}>Selecione um usuário para editar</div>
                  )}
                </div>
              )}

              {/* Auditoria */}
              {adminTab==='auditoria'&&(
                <div style={{background:'rgba(10,10,10,0.75)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:12,backdropFilter:'blur(12px)'}}>
                  {auditLogs.length===0&&<p style={{padding:36,textAlign:'center',color:'#4B5563',fontSize:13}}>Nenhuma ação registrada ainda.</p>}
                  <table style={{width:'100%',borderCollapse:'collapse'}}>
                    <thead><tr style={{borderBottom:'1px solid rgba(255,255,255,0.06)'}}>{['Usuário','Ação','Recurso','Data'].map(h=><th key={h} style={{padding:'11px 20px',textAlign:'left',fontSize:10,fontWeight:600,color:'#4B5563',textTransform:'uppercase',letterSpacing:'0.1em'}}>{h}</th>)}</tr></thead>
                    <tbody>
                      {auditLogs.map((a,idx)=>(
                        <tr key={a.id} style={{borderBottom:idx<auditLogs.length-1?'1px solid rgba(255,255,255,0.04)':'none'}}>
                          <td style={{padding:'11px 20px',fontSize:12,color:'#D1D5DB'}}>{a.user_name??'Sistema'}</td>
                          <td style={{padding:'11px 8px'}}><span style={{fontSize:10,fontWeight:600,color:'#E53E3E',background:'rgba(229,62,62,0.1)',padding:'2px 8px',borderRadius:99}}>{a.action}</span></td>
                          <td style={{padding:'11px 8px',fontSize:11,color:'#6B7280'}}>{a.resource}</td>
                          <td style={{padding:'11px 20px',fontSize:11,color:'#4B5563'}}>{fmtDate(a.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {/* ── MODAL DETALHE LEAD ── */}
      {detailLead&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',backdropFilter:'blur(4px)',zIndex:50,display:'flex',alignItems:'center',justifyContent:'center',padding:24}} onClick={()=>setDetailLead(null)}>
          <div style={{background:'#111',border:'1px solid rgba(255,255,255,0.08)',borderRadius:16,width:'100%',maxWidth:560,maxHeight:'82vh',overflow:'auto',fontFamily:'Montserrat,sans-serif'}} onClick={e=>e.stopPropagation()}>
            <div style={{padding:'18px 22px',borderBottom:'1px solid rgba(255,255,255,0.06)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <div style={{display:'flex',alignItems:'center',gap:12}}>
                <div style={{width:40,height:40,borderRadius:'50%',background:'rgba(229,62,62,0.15)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:700,color:'#E53E3E'}}>{initials(detailLead.name,detailLead.phone)}</div>
                <div>
                  <div style={{fontSize:16,fontWeight:700,color:'#F9FAFB'}}>{detailLead.name}</div>
                  <div style={{fontSize:11,color:'#6B7280'}}>{detailLead.phone} {detailLead.company_name?`· ${detailLead.company_name}`:''}</div>
                </div>
              </div>
              <button onClick={()=>setDetailLead(null)} style={{background:'none',border:'none',color:'#6B7280',cursor:'pointer',fontSize:20,lineHeight:1}}>×</button>
            </div>
            <div style={{padding:22,display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
              {[
                {k:'Nicho',v:detailLead.niche},{k:'Faturamento',v:detailLead.revenue_range},
                {k:'Serviço desejado',v:detailLead.desired_service},{k:'Orçamento',v:detailLead.estimated_budget},
                {k:'Urgência',v:detailLead.urgency?.replace(/_/g,' ')},{k:'Origem',v:sourceLabel[detailLead.source??'']??detailLead.source},
                {k:'Perfil',v:profileLabel[detailLead.profile??'']??detailLead.profile},{k:'Cadastro',v:fmtDateShort(detailLead.created_at)},
              ].map(({k,v})=>v?(
                <div key={k}>
                  <div style={{fontSize:9,fontWeight:600,color:'#4B5563',textTransform:'uppercase',letterSpacing:'0.12em',marginBottom:3}}>{k}</div>
                  <div style={{fontSize:12,color:'#D1D5DB'}}>{v}</div>
                </div>
              ):null)}
            </div>
            <div style={{padding:'0 22px 16px'}}>
              <div style={{fontSize:9,fontWeight:600,color:'#4B5563',textTransform:'uppercase',letterSpacing:'0.12em',marginBottom:6}}>Score · {detailLead.score}pts</div>
              <div style={{height:5,background:'rgba(255,255,255,0.06)',borderRadius:999}}><div style={{height:'100%',width:`${detailLead.score}%`,background:'linear-gradient(to right,#B91C1C,#E53E3E)',borderRadius:999}}/></div>
            </div>
            {detailLead.main_pains&&<div style={{padding:'0 22px 16px'}}><div style={{fontSize:9,fontWeight:600,color:'#4B5563',textTransform:'uppercase',letterSpacing:'0.12em',marginBottom:4}}>Dores principais</div><div style={{fontSize:12,color:'#D1D5DB',lineHeight:1.6}}>{detailLead.main_pains}</div></div>}
            <div style={{padding:'16px 22px',borderTop:'1px solid rgba(255,255,255,0.06)'}}>
              <div style={{fontSize:10,fontWeight:600,color:'#4B5563',textTransform:'uppercase',letterSpacing:'0.12em',marginBottom:10}}>Mover na Jornada</div>
              <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:14}}>
                {['aquisicao','vendas','operacao'].map(k=>(
                  <div key={k}>
                    <div style={{fontSize:9,color:'#374151',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:5}}>{KANBAN_LABELS[k]}</div>
                    <div style={{display:'flex',flexWrap:'wrap',gap:5}}>
                      {stages.filter(s=>s.kanban===k).map(s=>(
                        <button key={s.id} onClick={()=>{moveLead(detailLead.id,s.id);setDetailLead(null)}} style={{fontSize:10,padding:'4px 10px',borderRadius:6,border:`1px solid ${detailLead.stage_id===s.id?s.color:'rgba(255,255,255,0.08)'}`,background:detailLead.stage_id===s.id?`${s.color}20`:'transparent',color:detailLead.stage_id===s.id?s.color:'#9CA3AF',cursor:'pointer',fontWeight:detailLead.stage_id===s.id?600:400}}>
                          {s.name}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{display:'flex',gap:8}}>
                <button onClick={()=>{setChatLead(detailLead);setDetailLead(null)}} style={{flex:1,padding:'9px',borderRadius:8,background:'rgba(59,130,246,0.1)',border:'1px solid rgba(59,130,246,0.25)',color:'#60A5FA',fontSize:12,cursor:'pointer',fontWeight:500}}>💬 Abrir Chat</button>
                <button onClick={()=>{setFuModal({leadId:detailLead.id});setDetailLead(null)}} style={{flex:1,padding:'9px',borderRadius:8,background:'rgba(245,158,11,0.1)',border:'1px solid rgba(245,158,11,0.25)',color:'#F59E0B',fontSize:12,cursor:'pointer',fontWeight:500}}>⏰ Follow-up</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL CHAT ── */}
      {chatLead&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',backdropFilter:'blur(4px)',zIndex:50,display:'flex',alignItems:'flex-end',justifyContent:'flex-end',padding:24}} onClick={()=>setChatLead(null)}>
          <div style={{background:'#111',border:'1px solid rgba(255,255,255,0.08)',borderRadius:16,width:440,height:'70vh',display:'flex',flexDirection:'column',fontFamily:'Montserrat,sans-serif'}} onClick={e=>e.stopPropagation()}>
            <div style={{padding:'13px 18px',borderBottom:'1px solid rgba(255,255,255,0.06)',display:'flex',alignItems:'center',gap:10}}>
              <div style={{width:36,height:36,borderRadius:'50%',background:'rgba(229,62,62,0.15)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,color:'#E53E3E',flexShrink:0}}>{initials(chatLead.name,chatLead.phone)}</div>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:600,color:'#F9FAFB'}}>{chatLead.name}</div>
                <div style={{fontSize:10,color:'#6B7280'}}>{chatLead.phone}</div>
              </div>
              {leadAiConv(chatLead.id)&&(
                <button onClick={()=>{const c=leadAiConv(chatLead.id);if(c)toggleHumanTakeover(c)}} style={{fontSize:10,padding:'4px 10px',borderRadius:6,border:'1px solid',cursor:'pointer',fontWeight:500,background:leadAiConv(chatLead.id)?.human_takeover?'rgba(16,185,129,0.1)':'rgba(229,62,62,0.1)',color:leadAiConv(chatLead.id)?.human_takeover?'#34D399':'#E53E3E',borderColor:leadAiConv(chatLead.id)?.human_takeover?'rgba(16,185,129,0.3)':'rgba(229,62,62,0.3)'}}>
                  {leadAiConv(chatLead.id)?.human_takeover?'▶ Retomar IA':'⏸ Pausar IA'}
                </button>
              )}
              <button onClick={()=>setChatLead(null)} style={{background:'none',border:'none',color:'#6B7280',cursor:'pointer',fontSize:18,lineHeight:1}}>×</button>
            </div>
            <div ref={msgsRef} style={{flex:1,overflowY:'auto',padding:'14px 16px',display:'flex',flexDirection:'column',gap:8}}>
              {leadInteractions(chatLead.id).map(int=>(
                <div key={int.id} style={{display:'flex',justifyContent:int.direction==='inbound'?'flex-start':'flex-end'}}>
                  <div style={{maxWidth:'78%',padding:'9px 13px',borderRadius:int.direction==='inbound'?'4px 12px 12px 12px':'12px 4px 12px 12px',background:int.direction==='inbound'?'#161616':'rgba(229,62,62,0.12)',border:`1px solid ${int.direction==='inbound'?'rgba(255,255,255,0.05)':'rgba(229,62,62,0.25)'}`,fontSize:12,color:'#F9FAFB',lineHeight:1.5,whiteSpace:'pre-wrap'}}>
                    {int.content}
                    <div style={{fontSize:9,color:'#4B5563',marginTop:3}}>{fmtDate(int.created_at)}{int.direction==='outbound'&&<span style={{marginLeft:6,color:int.ai_generated?'#E53E3E':'#6B7280'}}>{int.ai_generated?'✦ IA':'✍'}</span>}</div>
                  </div>
                </div>
              ))}
              {leadInteractions(chatLead.id).length===0&&<p style={{textAlign:'center',color:'#4B5563',fontSize:12,paddingTop:20}}>Nenhuma interação ainda.</p>}
            </div>
            <div style={{padding:'10px 16px',borderTop:'1px solid rgba(255,255,255,0.06)',display:'flex',gap:8}}>
              <textarea value={replyText} onChange={e=>setReplyText(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage()}}} placeholder="Mensagem... (Enter para enviar)" rows={2} style={{...inp,resize:'none',flex:1,fontSize:12}}/>
              <button onClick={sendMessage} disabled={sending||!replyText.trim()} style={{padding:'8px 14px',borderRadius:8,border:'none',fontSize:12,fontWeight:600,color:'#fff',cursor:'pointer',background:'linear-gradient(135deg,#E53E3E,#B91C1C)',alignSelf:'flex-end',opacity:sending||!replyText.trim()?0.4:1}}>↑</button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL FOLLOW-UP ── */}
      {fuModal!==null&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',backdropFilter:'blur(4px)',zIndex:50,display:'flex',alignItems:'center',justifyContent:'center',padding:24}} onClick={()=>setFuModal(null)}>
          <div style={{background:'#111',border:'1px solid rgba(255,255,255,0.08)',borderRadius:16,width:'100%',maxWidth:440,fontFamily:'Montserrat,sans-serif'}} onClick={e=>e.stopPropagation()}>
            <div style={{padding:'16px 20px',borderBottom:'1px solid rgba(255,255,255,0.06)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div style={{fontSize:15,fontWeight:700,color:'#F9FAFB'}}>Novo Follow-up</div>
              <button onClick={()=>setFuModal(null)} style={{background:'none',border:'none',color:'#6B7280',cursor:'pointer',fontSize:18}}>×</button>
            </div>
            <div style={{padding:20,display:'flex',flexDirection:'column',gap:12}}>
              {fuModal.leadId===''&&(
                <div>
                  <label style={{fontSize:10,fontWeight:600,color:'#4B5563',textTransform:'uppercase',letterSpacing:'0.12em',display:'block',marginBottom:5}}>Lead</label>
                  <select style={sel} onChange={e=>setFuModal({leadId:e.target.value})}>
                    <option value=''>Selecionar lead...</option>
                    {leads.map(l=><option key={l.id} value={l.id}>{l.name} — {stageMap[l.stage_id]?.name}</option>)}
                  </select>
                </div>
              )}
              {fuModal.leadId&&<div style={{padding:'10px 12px',background:'rgba(229,62,62,0.08)',border:'1px solid rgba(229,62,62,0.2)',borderRadius:8,fontSize:12,color:'#F9FAFB',fontWeight:500}}>{leads.find(l=>l.id===fuModal.leadId)?.name} — {stageMap[leads.find(l=>l.id===fuModal.leadId)?.stage_id??0]?.name}</div>}
              <div>
                <label style={{fontSize:10,fontWeight:600,color:'#4B5563',textTransform:'uppercase',letterSpacing:'0.12em',display:'block',marginBottom:5}}>Motivo *</label>
                <input value={newFu.reason} onChange={e=>setNewFu(p=>({...p,reason:e.target.value}))} placeholder="Ex: Proposta enviada, aguardando retorno" style={inp}/>
              </div>
              <div>
                <label style={{fontSize:10,fontWeight:600,color:'#4B5563',textTransform:'uppercase',letterSpacing:'0.12em',display:'block',marginBottom:5}}>Próximo contato *</label>
                <input type="datetime-local" value={newFu.next_contact_at} onChange={e=>setNewFu(p=>({...p,next_contact_at:e.target.value}))} style={inp}/>
              </div>
              <div>
                <label style={{fontSize:10,fontWeight:600,color:'#4B5563',textTransform:'uppercase',letterSpacing:'0.12em',display:'block',marginBottom:5}}>Responsável</label>
                <input value={newFu.responsible} onChange={e=>setNewFu(p=>({...p,responsible:e.target.value}))} style={inp}/>
              </div>
              <div>
                <label style={{fontSize:10,fontWeight:600,color:'#4B5563',textTransform:'uppercase',letterSpacing:'0.12em',display:'block',marginBottom:5}}>Nota inicial</label>
                <textarea value={newFu.content} onChange={e=>setNewFu(p=>({...p,content:e.target.value}))} placeholder="Contexto do follow-up..." rows={2} style={{...inp,resize:'none'}}/>
              </div>
              <button onClick={()=>fuModal.leadId&&createFollowUp(fuModal.leadId)} disabled={!fuModal.leadId||!newFu.reason.trim()||!newFu.next_contact_at} style={{padding:'11px',borderRadius:10,border:'none',fontSize:13,fontWeight:600,color:'#fff',cursor:'pointer',background:'linear-gradient(135deg,#E53E3E,#B91C1C)',opacity:!fuModal.leadId||!newFu.reason.trim()||!newFu.next_contact_at?0.4:1}}>
                Criar Follow-up
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL NOVO LEAD ── */}
      {addLeadModal&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',backdropFilter:'blur(4px)',zIndex:50,display:'flex',alignItems:'center',justifyContent:'center',padding:24}} onClick={()=>setAddLeadModal(false)}>
          <div style={{background:'#111',border:'1px solid rgba(255,255,255,0.08)',borderRadius:16,width:'100%',maxWidth:480,fontFamily:'Montserrat,sans-serif'}} onClick={e=>e.stopPropagation()}>
            <div style={{padding:'18px 22px',borderBottom:'1px solid rgba(255,255,255,0.06)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <div style={{fontSize:15,fontWeight:700,color:'#F9FAFB'}}>Novo Lead</div>
              <button onClick={()=>setAddLeadModal(false)} style={{background:'none',border:'none',color:'#6B7280',cursor:'pointer',fontSize:20,lineHeight:1}}>×</button>
            </div>
            <div style={{padding:22,display:'flex',flexDirection:'column',gap:14}}>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                {[
                  {l:'Nome *',k:'name',ph:'Dr. João Silva'},
                  {l:'Telefone *',k:'phone',ph:'5511999999999'},
                  {l:'Empresa',k:'company_name',ph:'Clínica Dr. Silva'},
                  {l:'Nicho',k:'niche',ph:'Clínica estética'},
                ].map(({l,k,ph})=>(
                  <div key={k}>
                    <label style={{fontSize:10,fontWeight:600,color:'#4B5563',textTransform:'uppercase',letterSpacing:'0.12em',display:'block',marginBottom:5}}>{l}</label>
                    <input value={(newLead as Record<string,string>)[k]} onChange={e=>setNewLead(p=>({...p,[k]:e.target.value}))} placeholder={ph} style={inp}/>
                  </div>
                ))}
                <div>
                  <label style={{fontSize:10,fontWeight:600,color:'#4B5563',textTransform:'uppercase',letterSpacing:'0.12em',display:'block',marginBottom:5}}>Origem</label>
                  <select value={newLead.source} onChange={e=>setNewLead(p=>({...p,source:e.target.value}))} style={sel}>{Object.entries(sourceLabel).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select>
                </div>
                <div>
                  <label style={{fontSize:10,fontWeight:600,color:'#4B5563',textTransform:'uppercase',letterSpacing:'0.12em',display:'block',marginBottom:5}}>Perfil</label>
                  <select value={newLead.profile} onChange={e=>setNewLead(p=>({...p,profile:e.target.value}))} style={sel}>{Object.entries(profileLabel).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select>
                </div>
              </div>
              <div>
                <label style={{fontSize:10,fontWeight:600,color:'#4B5563',textTransform:'uppercase',letterSpacing:'0.12em',display:'block',marginBottom:5}}>Serviço desejado</label>
                <input value={newLead.desired_service} onChange={e=>setNewLead(p=>({...p,desired_service:e.target.value}))} placeholder="Gestão de tráfego, identidade visual..." style={inp}/>
              </div>
              <button onClick={createLead} disabled={!newLead.name.trim()||!newLead.phone.trim()} style={{padding:'11px',borderRadius:10,border:'none',fontSize:13,fontWeight:600,color:'#fff',cursor:'pointer',background:'linear-gradient(135deg,#E53E3E,#B91C1C)',opacity:!newLead.name.trim()||!newLead.phone.trim()?0.4:1}}>
                Cadastrar Lead
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL NOVO PROJETO ── */}
      {addProjectModal&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',backdropFilter:'blur(4px)',zIndex:50,display:'flex',alignItems:'center',justifyContent:'center',padding:24}} onClick={()=>setAddProjectModal(false)}>
          <div style={{background:'#111',border:'1px solid rgba(255,255,255,0.08)',borderRadius:16,width:'100%',maxWidth:460,fontFamily:'Montserrat,sans-serif'}} onClick={e=>e.stopPropagation()}>
            <div style={{padding:'16px 20px',borderBottom:'1px solid rgba(255,255,255,0.06)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div style={{fontSize:15,fontWeight:700,color:'#F9FAFB'}}>Novo Projeto</div>
              <button onClick={()=>setAddProjectModal(false)} style={{background:'none',border:'none',color:'#6B7280',cursor:'pointer',fontSize:18}}>×</button>
            </div>
            <div style={{padding:20,display:'flex',flexDirection:'column',gap:12}}>
              {[{l:'Nome do projeto *',k:'name',ph:'Identidade Visual — Clínica X'},{l:'Cliente',k:'client_name',ph:'Dr. João Silva'},{l:'Descrição',k:'description',ph:'Escopo do projeto...'}].map(({l,k,ph})=>(
                <div key={k}>
                  <label style={{fontSize:10,fontWeight:600,color:'#4B5563',textTransform:'uppercase',letterSpacing:'0.12em',display:'block',marginBottom:5}}>{l}</label>
                  {k==='description'
                    ?<textarea value={(newProject as Record<string,string>)[k]} onChange={e=>setNewProject(p=>({...p,[k]:e.target.value}))} placeholder={ph} rows={2} style={{padding:'9px 12px',background:'#0D0D0D',border:'1px solid rgba(255,255,255,0.08)',borderRadius:8,color:'#F9FAFB',fontSize:13,outline:'none',width:'100%',fontFamily:'Montserrat,sans-serif',resize:'none'}}/>
                    :<input value={(newProject as Record<string,string>)[k]} onChange={e=>setNewProject(p=>({...p,[k]:e.target.value}))} placeholder={ph} style={{padding:'9px 12px',background:'#0D0D0D',border:'1px solid rgba(255,255,255,0.08)',borderRadius:8,color:'#F9FAFB',fontSize:13,outline:'none',width:'100%',fontFamily:'Montserrat,sans-serif'}}/>
                  }
                </div>
              ))}
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10}}>
                <div>
                  <label style={{fontSize:10,fontWeight:600,color:'#4B5563',textTransform:'uppercase',letterSpacing:'0.12em',display:'block',marginBottom:5}}>Orçamento</label>
                  <input type="number" value={newProject.budget} onChange={e=>setNewProject(p=>({...p,budget:e.target.value}))} placeholder="5000" style={{padding:'9px 12px',background:'#0D0D0D',border:'1px solid rgba(255,255,255,0.08)',borderRadius:8,color:'#F9FAFB',fontSize:13,outline:'none',width:'100%',fontFamily:'Montserrat,sans-serif'}}/>
                </div>
                <div>
                  <label style={{fontSize:10,fontWeight:600,color:'#4B5563',textTransform:'uppercase',letterSpacing:'0.12em',display:'block',marginBottom:5}}>Início</label>
                  <input type="date" value={newProject.start_date} onChange={e=>setNewProject(p=>({...p,start_date:e.target.value}))} style={{padding:'9px 12px',background:'#0D0D0D',border:'1px solid rgba(255,255,255,0.08)',borderRadius:8,color:'#F9FAFB',fontSize:13,outline:'none',width:'100%',fontFamily:'Montserrat,sans-serif'}}/>
                </div>
                <div>
                  <label style={{fontSize:10,fontWeight:600,color:'#4B5563',textTransform:'uppercase',letterSpacing:'0.12em',display:'block',marginBottom:5}}>Prazo</label>
                  <input type="date" value={newProject.end_date} onChange={e=>setNewProject(p=>({...p,end_date:e.target.value}))} style={{padding:'9px 12px',background:'#0D0D0D',border:'1px solid rgba(255,255,255,0.08)',borderRadius:8,color:'#F9FAFB',fontSize:13,outline:'none',width:'100%',fontFamily:'Montserrat,sans-serif'}}/>
                </div>
              </div>
              <div>
                <label style={{fontSize:10,fontWeight:600,color:'#4B5563',textTransform:'uppercase',letterSpacing:'0.12em',display:'block',marginBottom:8}}>Cor</label>
                <div style={{display:'flex',gap:8}}>
                  {['#E53E3E','#3B82F6','#10B981','#F59E0B','#8B5CF6','#EC4899','#06B6D4'].map(c=>(
                    <div key={c} onClick={()=>setNewProject(p=>({...p,color:c}))} style={{width:28,height:28,borderRadius:'50%',background:c,cursor:'pointer',border:newProject.color===c?'3px solid #fff':'3px solid transparent'}}/>
                  ))}
                </div>
              </div>
              <button onClick={createProject} disabled={!newProject.name.trim()} style={{padding:'11px',borderRadius:10,border:'none',fontSize:13,fontWeight:600,color:'#fff',cursor:'pointer',background:'linear-gradient(135deg,#E53E3E,#B91C1C)',opacity:!newProject.name.trim()?0.4:1,marginTop:4}}>Criar Projeto</button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL NOVA TAREFA ── */}
      {addTaskModal&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',backdropFilter:'blur(4px)',zIndex:50,display:'flex',alignItems:'center',justifyContent:'center',padding:24}} onClick={()=>setAddTaskModal(null)}>
          <div style={{background:'#111',border:'1px solid rgba(255,255,255,0.08)',borderRadius:16,width:'100%',maxWidth:420,fontFamily:'Montserrat,sans-serif'}} onClick={e=>e.stopPropagation()}>
            <div style={{padding:'16px 20px',borderBottom:'1px solid rgba(255,255,255,0.06)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div style={{fontSize:15,fontWeight:700,color:'#F9FAFB'}}>Nova Tarefa</div>
              <button onClick={()=>setAddTaskModal(null)} style={{background:'none',border:'none',color:'#6B7280',cursor:'pointer',fontSize:18}}>×</button>
            </div>
            <div style={{padding:20,display:'flex',flexDirection:'column',gap:12}}>
              <div>
                <label style={{fontSize:10,fontWeight:600,color:'#4B5563',textTransform:'uppercase',letterSpacing:'0.12em',display:'block',marginBottom:5}}>Título *</label>
                <input value={newTask.title} onChange={e=>setNewTask(p=>({...p,title:e.target.value}))} placeholder="Ex: Criar artes para feed" style={{padding:'9px 12px',background:'#0D0D0D',border:'1px solid rgba(255,255,255,0.08)',borderRadius:8,color:'#F9FAFB',fontSize:13,outline:'none',width:'100%',fontFamily:'Montserrat,sans-serif'}}/>
              </div>
              <div>
                <label style={{fontSize:10,fontWeight:600,color:'#4B5563',textTransform:'uppercase',letterSpacing:'0.12em',display:'block',marginBottom:5}}>Responsável</label>
                <select value={newTask.assigned_to} onChange={e=>setNewTask(p=>({...p,assigned_to:e.target.value}))} style={{padding:'9px 12px',background:'#0D0D0D',border:'1px solid rgba(255,255,255,0.08)',borderRadius:8,color:'#F9FAFB',fontSize:13,outline:'none',width:'100%',fontFamily:'Montserrat,sans-serif',cursor:'pointer'}}>
                  <option value=''>Sem responsável</option>
                  {members.map(m=><option key={m.id} value={m.id}>{m.name} — {m.role}</option>)}
                </select>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                <div>
                  <label style={{fontSize:10,fontWeight:600,color:'#4B5563',textTransform:'uppercase',letterSpacing:'0.12em',display:'block',marginBottom:5}}>Prioridade</label>
                  <select value={newTask.priority} onChange={e=>setNewTask(p=>({...p,priority:e.target.value}))} style={{padding:'9px 12px',background:'#0D0D0D',border:'1px solid rgba(255,255,255,0.08)',borderRadius:8,color:'#F9FAFB',fontSize:13,outline:'none',width:'100%',fontFamily:'Montserrat,sans-serif',cursor:'pointer'}}>
                    {Object.entries(priorityLabel).map(([k,v])=><option key={k} value={k}>{v} (+{priorityXP[k]}XP)</option>)}
                  </select>
                </div>
                <div>
                  <label style={{fontSize:10,fontWeight:600,color:'#4B5563',textTransform:'uppercase',letterSpacing:'0.12em',display:'block',marginBottom:5}}>Prazo</label>
                  <input type="date" value={newTask.due_date} onChange={e=>setNewTask(p=>({...p,due_date:e.target.value}))} style={{padding:'9px 12px',background:'#0D0D0D',border:'1px solid rgba(255,255,255,0.08)',borderRadius:8,color:'#F9FAFB',fontSize:13,outline:'none',width:'100%',fontFamily:'Montserrat,sans-serif'}}/>
                </div>
              </div>
              <div style={{padding:'10px 12px',background:'rgba(229,62,62,0.06)',border:'1px solid rgba(229,62,62,0.15)',borderRadius:8,fontSize:11,color:'#E53E3E'}}>✦ Essa tarefa vale <strong>{priorityXP[newTask.priority]??20} XP</strong> para o responsável ao ser concluída</div>
              <button onClick={()=>createTask(addTaskModal.projectId)} disabled={!newTask.title.trim()} style={{padding:'11px',borderRadius:10,border:'none',fontSize:13,fontWeight:600,color:'#fff',cursor:'pointer',background:'linear-gradient(135deg,#E53E3E,#B91C1C)',opacity:!newTask.title.trim()?0.4:1}}>Criar Tarefa</button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL NOVA CAMPANHA ── */}
      {addCampaignModal&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',backdropFilter:'blur(4px)',zIndex:50,display:'flex',alignItems:'center',justifyContent:'center',padding:24}} onClick={()=>setAddCampaignModal(false)}>
          <div style={{background:'#111',border:'1px solid rgba(255,255,255,0.08)',borderRadius:16,width:'100%',maxWidth:520,maxHeight:'85vh',overflow:'auto',fontFamily:'Montserrat,sans-serif'}} onClick={e=>e.stopPropagation()}>
            <div style={{padding:'16px 20px',borderBottom:'1px solid rgba(255,255,255,0.06)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div style={{fontSize:15,fontWeight:700,color:'#F9FAFB'}}>Nova Campanha</div>
              <button onClick={()=>setAddCampaignModal(false)} style={{background:'none',border:'none',color:'#6B7280',cursor:'pointer',fontSize:18}}>×</button>
            </div>
            <div style={{padding:20,display:'flex',flexDirection:'column',gap:12}}>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                {[{l:'Cliente *',k:'client_name',ph:'Clínica Dr. Silva'},{l:'Nome da campanha *',k:'campaign_name',ph:'Campanha Leads Jun/26'}].map(({l,k,ph})=>(
                  <div key={k}>
                    <label style={{fontSize:10,fontWeight:600,color:'#4B5563',textTransform:'uppercase',letterSpacing:'0.12em',display:'block',marginBottom:5}}>{l}</label>
                    <input value={(newCampaign as Record<string,string>)[k]} onChange={e=>setNewCampaign(p=>({...p,[k]:e.target.value}))} placeholder={ph} style={{padding:'9px 12px',background:'#0D0D0D',border:'1px solid rgba(255,255,255,0.08)',borderRadius:8,color:'#F9FAFB',fontSize:13,outline:'none',width:'100%',fontFamily:'Montserrat,sans-serif'}}/>
                  </div>
                ))}
              </div>
              <div>
                <label style={{fontSize:10,fontWeight:600,color:'#4B5563',textTransform:'uppercase',letterSpacing:'0.12em',display:'block',marginBottom:5}}>Plataforma</label>
                <select value={newCampaign.platform} onChange={e=>setNewCampaign(p=>({...p,platform:e.target.value}))} style={{padding:'9px 12px',background:'#0D0D0D',border:'1px solid rgba(255,255,255,0.08)',borderRadius:8,color:'#F9FAFB',fontSize:13,outline:'none',width:'100%',fontFamily:'Montserrat,sans-serif',cursor:'pointer'}}>
                  {Object.entries(platformLabel).map(([k,v])=><option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10}}>
                {[{l:'Orçamento (R$)',k:'budget'},{l:'Gasto (R$)',k:'spend'},{l:'Receita (R$)',k:'revenue'},{l:'Impressões',k:'impressions'},{l:'Cliques',k:'clicks'},{l:'Leads gerados',k:'leads_gen'}].map(({l,k})=>(
                  <div key={k}>
                    <label style={{fontSize:9,fontWeight:600,color:'#4B5563',textTransform:'uppercase',letterSpacing:'0.12em',display:'block',marginBottom:4}}>{l}</label>
                    <input type="number" value={(newCampaign as Record<string,string>)[k]} onChange={e=>setNewCampaign(p=>({...p,[k]:e.target.value}))} placeholder="0" style={{padding:'8px 10px',background:'#0D0D0D',border:'1px solid rgba(255,255,255,0.08)',borderRadius:7,color:'#F9FAFB',fontSize:12,outline:'none',width:'100%',fontFamily:'Montserrat,sans-serif'}}/>
                  </div>
                ))}
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                {[{l:'Período início',k:'period_start'},{l:'Período fim',k:'period_end'}].map(({l,k})=>(
                  <div key={k}>
                    <label style={{fontSize:10,fontWeight:600,color:'#4B5563',textTransform:'uppercase',letterSpacing:'0.12em',display:'block',marginBottom:5}}>{l}</label>
                    <input type="date" value={(newCampaign as Record<string,string>)[k]} onChange={e=>setNewCampaign(p=>({...p,[k]:e.target.value}))} style={{padding:'9px 12px',background:'#0D0D0D',border:'1px solid rgba(255,255,255,0.08)',borderRadius:8,color:'#F9FAFB',fontSize:13,outline:'none',width:'100%',fontFamily:'Montserrat,sans-serif'}}/>
                  </div>
                ))}
              </div>
              <button onClick={createCampaign} disabled={!newCampaign.client_name.trim()||!newCampaign.campaign_name.trim()} style={{padding:'11px',borderRadius:10,border:'none',fontSize:13,fontWeight:600,color:'#fff',cursor:'pointer',background:'linear-gradient(135deg,#E53E3E,#B91C1C)',opacity:!newCampaign.client_name.trim()||!newCampaign.campaign_name.trim()?0.4:1}}>Criar Campanha</button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL NOVO MEMBRO ── */}
      {addMemberModal&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',backdropFilter:'blur(4px)',zIndex:50,display:'flex',alignItems:'center',justifyContent:'center',padding:24}} onClick={()=>setAddMemberModal(false)}>
          <div style={{background:'#111',border:'1px solid rgba(255,255,255,0.08)',borderRadius:16,width:'100%',maxWidth:380,fontFamily:'Montserrat,sans-serif'}} onClick={e=>e.stopPropagation()}>
            <div style={{padding:'16px 20px',borderBottom:'1px solid rgba(255,255,255,0.06)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div style={{fontSize:15,fontWeight:700,color:'#F9FAFB'}}>Novo Membro</div>
              <button onClick={()=>setAddMemberModal(false)} style={{background:'none',border:'none',color:'#6B7280',cursor:'pointer',fontSize:18}}>×</button>
            </div>
            <div style={{padding:20,display:'flex',flexDirection:'column',gap:12}}>
              {[{l:'Nome *',k:'name',ph:'Fulano de Tal'},{l:'Email',k:'email',ph:'fulano@dropagency.com'},{l:'Cargo *',k:'role',ph:'Designer, Copywriter...'}].map(({l,k,ph})=>(
                <div key={k}>
                  <label style={{fontSize:10,fontWeight:600,color:'#4B5563',textTransform:'uppercase',letterSpacing:'0.12em',display:'block',marginBottom:5}}>{l}</label>
                  <input value={(newMember as Record<string,string>)[k]} onChange={e=>setNewMember(p=>({...p,[k]:e.target.value}))} placeholder={ph} style={{padding:'9px 12px',background:'#0D0D0D',border:'1px solid rgba(255,255,255,0.08)',borderRadius:8,color:'#F9FAFB',fontSize:13,outline:'none',width:'100%',fontFamily:'Montserrat,sans-serif'}}/>
                </div>
              ))}
              <div>
                <label style={{fontSize:10,fontWeight:600,color:'#4B5563',textTransform:'uppercase',letterSpacing:'0.12em',display:'block',marginBottom:8}}>Cor do avatar</label>
                <div style={{display:'flex',gap:8}}>
                  {['#E53E3E','#3B82F6','#10B981','#F59E0B','#8B5CF6','#EC4899','#06B6D4'].map(c=>(
                    <div key={c} onClick={()=>setNewMember(p=>({...p,avatar_color:c}))} style={{width:28,height:28,borderRadius:'50%',background:c,cursor:'pointer',border:newMember.avatar_color===c?'3px solid #fff':'3px solid transparent'}}/>
                  ))}
                </div>
              </div>
              <button onClick={createMember} disabled={!newMember.name.trim()||!newMember.role.trim()} style={{padding:'11px',borderRadius:10,border:'none',fontSize:13,fontWeight:600,color:'#fff',cursor:'pointer',background:'linear-gradient(135deg,#E53E3E,#B91C1C)',opacity:!newMember.name.trim()||!newMember.role.trim()?0.4:1}}>Adicionar Membro</button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL CONFIGURAR ACESSO (ORGANOGRAMA) ── */}
      {orgAccessModal&&(()=>{
        const member = orgAccessModal
        const existingProfile = userProfiles.find(p=>p.member_id===member.id)
        const isUpdate = !!existingProfile
        const inpStyle:React.CSSProperties = {padding:'9px 12px',background:'#0D0D0D',border:'1px solid rgba(255,255,255,0.08)',borderRadius:8,color:'#F9FAFB',fontSize:13,outline:'none',width:'100%',fontFamily:'Montserrat,sans-serif'}

        async function saveAccess() {
          if(!orgAccessForm.email.trim()||!orgAccessForm.password.trim()) return
          if(orgAccessForm.password!==orgAccessForm.confirmPassword){setToast('As senhas não coincidem.');return}
          if(orgAccessForm.password.length<8){setToast('Senha deve ter pelo menos 8 caracteres.');return}
          setOrgAccessSaving(true)
          try {
            const res = await fetch('/api/admin/create-user',{
              method:'POST',
              headers:{'Content-Type':'application/json'},
              body:JSON.stringify({
                name:member.name,
                email:orgAccessForm.email,
                password:orgAccessForm.password,
                role:'colaborador',
                member_id:member.id,
                permissions:{dashboard:true,crm:true,clientes:true,tarefas:true,projetos:false,marketing:false,equipe:false,financeiro:false,integracoes:false,configuracoes:false,administracao:false}
              })
            })
            const data = await res.json()
            if(data.success){
              setToast(`Acesso criado para ${member.name}!`)
              setOrgAccessModal(null)
              await fetchAll()
            } else {
              setToast(data.error??'Erro ao criar acesso.')
            }
          } finally { setOrgAccessSaving(false) }
        }

        return (
          <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.8)',backdropFilter:'blur(4px)',zIndex:50,display:'flex',alignItems:'center',justifyContent:'center',padding:24}} onClick={()=>setOrgAccessModal(null)}>
            <div style={{background:'#111',border:'1px solid rgba(255,255,255,0.08)',borderRadius:16,width:'100%',maxWidth:400,fontFamily:'Montserrat,sans-serif'}} onClick={e=>e.stopPropagation()}>
              <div style={{padding:'16px 20px',borderBottom:'1px solid rgba(255,255,255,0.06)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <div>
                  <div style={{fontSize:15,fontWeight:700,color:'#F9FAFB'}}>{isUpdate?'Gerenciar Acesso':'Configurar Acesso'}</div>
                  <div style={{fontSize:11,color:'#6B7280',marginTop:2}}>{member.name} · {member.role}</div>
                </div>
                <button onClick={()=>setOrgAccessModal(null)} style={{background:'none',border:'none',color:'#6B7280',cursor:'pointer',fontSize:18}}>×</button>
              </div>
              <div style={{padding:20,display:'flex',flexDirection:'column',gap:14}}>

                {isUpdate?(
                  <>
                    <div style={{background:'rgba(16,185,129,0.08)',border:'1px solid rgba(16,185,129,0.2)',borderRadius:10,padding:'12px 14px',display:'flex',gap:10,alignItems:'flex-start'}}>
                      <span style={{fontSize:16}}>✓</span>
                      <div>
                        <div style={{fontSize:12,fontWeight:600,color:'#10B981',marginBottom:2}}>Este colaborador já tem acesso</div>
                        <div style={{fontSize:11,color:'#4B5563'}}>Email: <span style={{color:'#9CA3AF'}}>{existingProfile.email}</span></div>
                        <div style={{fontSize:11,color:'#4B5563',marginTop:2}}>Para alterar a senha, use o painel de Administração.</div>
                      </div>
                    </div>
                    <button onClick={()=>setOrgAccessModal(null)} style={{padding:'10px',borderRadius:8,border:'1px solid rgba(255,255,255,0.1)',background:'transparent',color:'#9CA3AF',fontSize:13,cursor:'pointer',fontFamily:'Montserrat,sans-serif'}}>Fechar</button>
                  </>
                ):(
                  <>
                    <div style={{background:'rgba(229,62,62,0.06)',border:'1px solid rgba(229,62,62,0.15)',borderRadius:10,padding:'10px 14px',fontSize:11,color:'#9CA3AF'}}>
                      Defina o email e senha para que <strong style={{color:'#F9FAFB'}}>{member.name}</strong> possa entrar no sistema.
                    </div>
                    <div>
                      <label style={{fontSize:10,fontWeight:600,color:'#4B5563',textTransform:'uppercase',letterSpacing:'0.12em',display:'block',marginBottom:5}}>Email de acesso</label>
                      <input type="email" value={orgAccessForm.email} onChange={e=>setOrgAccessForm(p=>({...p,email:e.target.value}))} placeholder="colaborador@dropagency.com" style={inpStyle}/>
                    </div>
                    <div>
                      <label style={{fontSize:10,fontWeight:600,color:'#4B5563',textTransform:'uppercase',letterSpacing:'0.12em',display:'block',marginBottom:5}}>Senha (mín. 8 caracteres)</label>
                      <input type="password" value={orgAccessForm.password} onChange={e=>setOrgAccessForm(p=>({...p,password:e.target.value}))} placeholder="••••••••" style={inpStyle}/>
                    </div>
                    <div>
                      <label style={{fontSize:10,fontWeight:600,color:'#4B5563',textTransform:'uppercase',letterSpacing:'0.12em',display:'block',marginBottom:5}}>Confirmar senha</label>
                      <input type="password" value={orgAccessForm.confirmPassword} onChange={e=>setOrgAccessForm(p=>({...p,confirmPassword:e.target.value}))} placeholder="••••••••" style={inpStyle}/>
                    </div>
                    <button onClick={saveAccess} disabled={orgAccessSaving||!orgAccessForm.email.trim()||!orgAccessForm.password.trim()}
                      style={{padding:'11px',borderRadius:10,border:'none',fontSize:13,fontWeight:600,color:'#fff',cursor:'pointer',background:'linear-gradient(135deg,#E53E3E,#B91C1C)',opacity:orgAccessSaving||!orgAccessForm.email.trim()||!orgAccessForm.password.trim()?0.5:1,fontFamily:'Montserrat,sans-serif'}}>
                      {orgAccessSaving?'Criando acesso...':'Criar Acesso'}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── MODAL NOVA TAREFA STANDALONE ── */}
      {addTaskStandaloneModal&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',backdropFilter:'blur(4px)',zIndex:50,display:'flex',alignItems:'center',justifyContent:'center',padding:24}} onClick={()=>setAddTaskStandaloneModal(false)}>
          <div style={{background:'#111',border:'1px solid rgba(255,255,255,0.08)',borderRadius:16,width:'100%',maxWidth:520,maxHeight:'88vh',overflowY:'auto',fontFamily:'Montserrat,sans-serif'}} onClick={e=>e.stopPropagation()}>
            <div style={{padding:'16px 20px',borderBottom:'1px solid rgba(255,255,255,0.06)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div style={{fontSize:15,fontWeight:700,color:'#F9FAFB'}}>Nova Tarefa</div>
              <button onClick={()=>setAddTaskStandaloneModal(false)} style={{background:'none',border:'none',color:'#6B7280',cursor:'pointer',fontSize:18}}>×</button>
            </div>
            <div style={{padding:20,display:'flex',flexDirection:'column',gap:14}}>
              <div>
                <label style={{fontSize:10,fontWeight:600,color:'#4B5563',textTransform:'uppercase',letterSpacing:'0.12em',display:'block',marginBottom:5}}>Título *</label>
                <input value={newStandaloneTask.title} onChange={e=>setNewStandaloneTask(p=>({...p,title:e.target.value}))} placeholder="Ex: Criar campanha Meta Ads para clínica X" style={{padding:'9px 12px',background:'#0D0D0D',border:'1px solid rgba(255,255,255,0.08)',borderRadius:8,color:'#F9FAFB',fontSize:13,outline:'none',width:'100%',fontFamily:'Montserrat,sans-serif'}}/>
              </div>
              <div>
                <label style={{fontSize:10,fontWeight:600,color:'#4B5563',textTransform:'uppercase',letterSpacing:'0.12em',display:'block',marginBottom:5}}>Descrição</label>
                <textarea value={newStandaloneTask.description} onChange={e=>setNewStandaloneTask(p=>({...p,description:e.target.value}))} placeholder="Detalhes, entregáveis esperados..." rows={2} style={{padding:'9px 12px',background:'#0D0D0D',border:'1px solid rgba(255,255,255,0.08)',borderRadius:8,color:'#F9FAFB',fontSize:13,outline:'none',width:'100%',fontFamily:'Montserrat,sans-serif',resize:'none'}}/>
              </div>
              <div>
                <label style={{fontSize:10,fontWeight:600,color:'#4B5563',textTransform:'uppercase',letterSpacing:'0.12em',display:'block',marginBottom:5}}>Cliente vinculado</label>
                <select value={newStandaloneTask.lead_id} onChange={e=>setNewStandaloneTask(p=>({...p,lead_id:e.target.value}))} style={{padding:'9px 12px',background:'#0D0D0D',border:'1px solid rgba(255,255,255,0.08)',borderRadius:8,color:'#F9FAFB',fontSize:13,outline:'none',width:'100%',fontFamily:'Montserrat,sans-serif',cursor:'pointer'}}>
                  <option value=''>Sem cliente</option>
                  {leads.map(l=><option key={l.id} value={l.id}>{l.name}{l.company_name?` — ${l.company_name}`:''}</option>)}
                </select>
              </div>
              <div>
                <label style={{fontSize:10,fontWeight:600,color:'#4B5563',textTransform:'uppercase',letterSpacing:'0.12em',display:'block',marginBottom:8}}>Responsáveis</label>
                <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
                  {members.map(m=>{
                    const sel=newStandaloneTask.assignees.includes(m.id)
                    return (
                      <div key={m.id} onClick={()=>setNewStandaloneTask(p=>({...p,assignees:sel?p.assignees.filter(x=>x!==m.id):[...p.assignees,m.id]}))} style={{display:'flex',alignItems:'center',gap:6,padding:'5px 10px',borderRadius:20,border:`1px solid ${sel?m.avatar_color:'rgba(255,255,255,0.08)'}`,background:sel?`${m.avatar_color}18`:'transparent',cursor:'pointer',transition:'all 0.15s'}}>
                        <div style={{width:20,height:20,borderRadius:'50%',background:m.avatar_color,display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,fontWeight:700,color:'#fff'}}>{m.name[0]}</div>
                        <span style={{fontSize:11,color:sel?'#F9FAFB':'#6B7280',fontWeight:sel?600:400}}>{m.name.split(' ')[0]}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                <div>
                  <label style={{fontSize:10,fontWeight:600,color:'#4B5563',textTransform:'uppercase',letterSpacing:'0.12em',display:'block',marginBottom:5}}>Prioridade</label>
                  <select value={newStandaloneTask.priority} onChange={e=>setNewStandaloneTask(p=>({...p,priority:e.target.value}))} style={{padding:'9px 12px',background:'#0D0D0D',border:'1px solid rgba(255,255,255,0.08)',borderRadius:8,color:'#F9FAFB',fontSize:13,outline:'none',width:'100%',fontFamily:'Montserrat,sans-serif',cursor:'pointer'}}>
                    {Object.entries(priorityLabel).map(([k,v])=><option key={k} value={k}>{v} (+{priorityXP[k]}XP)</option>)}
                  </select>
                </div>
                <div>
                  <label style={{fontSize:10,fontWeight:600,color:'#4B5563',textTransform:'uppercase',letterSpacing:'0.12em',display:'block',marginBottom:5}}>Data limite</label>
                  <input type="date" value={newStandaloneTask.due_date} onChange={e=>setNewStandaloneTask(p=>({...p,due_date:e.target.value}))} style={{padding:'9px 12px',background:'#0D0D0D',border:'1px solid rgba(255,255,255,0.08)',borderRadius:8,color:'#F9FAFB',fontSize:13,outline:'none',width:'100%',fontFamily:'Montserrat,sans-serif'}}/>
                </div>
              </div>
              <div style={{padding:'10px 12px',background:'rgba(229,62,62,0.06)',border:'1px solid rgba(229,62,62,0.15)',borderRadius:8,fontSize:11,color:'#E53E3E'}}>
                ✦ Recompensa: <strong>+{priorityXP[newStandaloneTask.priority]??25} XP</strong> por responsável ao concluir{newStandaloneTask.due_date?' + bônus de prazo':''}
              </div>
              <button onClick={createStandaloneTask} disabled={!newStandaloneTask.title.trim()} style={{padding:'11px',borderRadius:10,border:'none',fontSize:13,fontWeight:600,color:'#fff',cursor:'pointer',background:'linear-gradient(135deg,#E53E3E,#B91C1C)',opacity:!newStandaloneTask.title.trim()?0.4:1}}>
                Criar Tarefa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL CRIAR USUÁRIO ── */}
      {createUserModal&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',backdropFilter:'blur(4px)',zIndex:50,display:'flex',alignItems:'center',justifyContent:'center',padding:24}} onClick={()=>setCreateUserModal(false)}>
          <div style={{background:'#111',border:'1px solid rgba(255,255,255,0.08)',borderRadius:16,width:'100%',maxWidth:500,maxHeight:'90vh',overflowY:'auto',fontFamily:'Montserrat,sans-serif'}} onClick={e=>e.stopPropagation()}>
            <div style={{padding:'16px 20px',borderBottom:'1px solid rgba(255,255,255,0.06)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div style={{fontSize:15,fontWeight:700,color:'#F9FAFB'}}>Novo Usuário</div>
              <button onClick={()=>setCreateUserModal(false)} style={{background:'none',border:'none',color:'#6B7280',cursor:'pointer',fontSize:18}}>×</button>
            </div>
            <div style={{padding:20,display:'flex',flexDirection:'column',gap:12}}>
              {[{l:'Nome completo *',k:'name',ph:'Fulano de Tal',t:'text'},{l:'E-mail *',k:'email',ph:'fulano@dropagency.com',t:'email'},{l:'Senha *',k:'password',ph:'Mínimo 8 caracteres',t:'password'}].map(({l,k,ph,t})=>(
                <div key={k}>
                  <label style={{fontSize:10,fontWeight:600,color:'#4B5563',textTransform:'uppercase',letterSpacing:'0.12em',display:'block',marginBottom:5}}>{l}</label>
                  <input type={t} value={(newUser as unknown as Record<string,string>)[k]} onChange={e=>setNewUser(p=>({...p,[k]:e.target.value}))} placeholder={ph} style={{padding:'9px 12px',background:'#0D0D0D',border:'1px solid rgba(255,255,255,0.08)',borderRadius:8,color:'#F9FAFB',fontSize:13,outline:'none',width:'100%',fontFamily:'Montserrat,sans-serif'}}/>
                </div>
              ))}
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                <div>
                  <label style={{fontSize:10,fontWeight:600,color:'#4B5563',textTransform:'uppercase',letterSpacing:'0.12em',display:'block',marginBottom:5}}>Nível de acesso</label>
                  <select value={newUser.role} onChange={e=>setNewUser(p=>({...p,role:e.target.value}))} style={{padding:'9px 12px',background:'#0D0D0D',border:'1px solid rgba(255,255,255,0.08)',borderRadius:8,color:'#F9FAFB',fontSize:13,outline:'none',width:'100%',fontFamily:'Montserrat,sans-serif',cursor:'pointer'}}>
                    <option value='colaborador'>Colaborador</option>
                    <option value='gestor'>Gestor</option>
                    <option value='admin'>Administrador</option>
                  </select>
                </div>
                <div>
                  <label style={{fontSize:10,fontWeight:600,color:'#4B5563',textTransform:'uppercase',letterSpacing:'0.12em',display:'block',marginBottom:5}}>Vincular membro</label>
                  <select value={newUser.member_id} onChange={e=>setNewUser(p=>({...p,member_id:e.target.value}))} style={{padding:'9px 12px',background:'#0D0D0D',border:'1px solid rgba(255,255,255,0.08)',borderRadius:8,color:'#F9FAFB',fontSize:13,outline:'none',width:'100%',fontFamily:'Montserrat,sans-serif',cursor:'pointer'}}>
                    <option value=''>Nenhum</option>
                    {members.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label style={{fontSize:10,fontWeight:600,color:'#4B5563',textTransform:'uppercase',letterSpacing:'0.12em',display:'block',marginBottom:8}}>Módulos liberados</label>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}>
                  {ALL_MODULES.map(mod=>(
                    <label key={mod} style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',padding:'6px 8px',background:'rgba(255,255,255,0.02)',borderRadius:6}}>
                      <div onClick={()=>setNewUser(p=>({...p,permissions:{...p.permissions,[mod]:!(p.permissions as Record<string,boolean>)[mod]}}))} style={{width:16,height:16,borderRadius:3,background:(newUser.permissions as Record<string,boolean>)[mod]?'#E53E3E':'rgba(255,255,255,0.06)',border:`1px solid ${(newUser.permissions as Record<string,boolean>)[mod]?'#E53E3E':'rgba(255,255,255,0.12)'}`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,cursor:'pointer'}}>
                        {(newUser.permissions as Record<string,boolean>)[mod]&&<svg width="9" height="9" viewBox="0 0 9 9"><path d="M1.5 4.5l2 2L7.5 2" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" fill="none"/></svg>}
                      </div>
                      <span style={{fontSize:11,color:'#D1D5DB'}}>{MODULE_LABELS[mod]}</span>
                    </label>
                  ))}
                </div>
              </div>
              <button onClick={createUser} disabled={savingUser||!newUser.name.trim()||!newUser.email.trim()||!newUser.password.trim()} style={{padding:'11px',borderRadius:10,border:'none',fontSize:13,fontWeight:600,color:'#fff',cursor:'pointer',background:'linear-gradient(135deg,#E53E3E,#B91C1C)',opacity:savingUser||!newUser.name.trim()||!newUser.email.trim()||!newUser.password.trim()?0.4:1}}>
                {savingUser?'Criando...' : 'Criar Usuário'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL PERFIL ── */}
      {profileModal&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',backdropFilter:'blur(4px)',zIndex:100,display:'flex',alignItems:'center',justifyContent:'center',padding:24}} onClick={()=>setProfileModal(false)}>
          <div style={{background:'#111',border:'1px solid rgba(255,255,255,0.08)',borderRadius:16,width:'100%',maxWidth:400,fontFamily:'Montserrat,sans-serif'}} onClick={e=>e.stopPropagation()}>
            <div style={{padding:'16px 20px',borderBottom:'1px solid rgba(255,255,255,0.06)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div style={{fontSize:15,fontWeight:700,color:'#F9FAFB'}}>Configurar Perfil</div>
              <button onClick={()=>setProfileModal(false)} style={{background:'none',border:'none',color:'#6B7280',cursor:'pointer',fontSize:18}}>×</button>
            </div>
            <div style={{padding:24,display:'flex',flexDirection:'column',gap:20,alignItems:'center'}}>
              {/* Avatar */}
              <div style={{position:'relative'}}>
                <div style={{width:80,height:80,borderRadius:'50%',overflow:'hidden',border:'3px solid rgba(229,62,62,0.5)',cursor:'pointer'}} onClick={()=>avatarInputRef.current?.click()}>
                  {currentUser?.avatar_url
                    ?<img src={currentUser.avatar_url} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/>
                    :<div style={{width:'100%',height:'100%',background:'linear-gradient(135deg,#E53E3E,#B91C1C)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:22,fontWeight:700,color:'#fff'}}>{(currentUser?.name??'U').split(' ').map((w:string)=>w[0]).join('').slice(0,2).toUpperCase()}</div>
                  }
                </div>
                <div onClick={()=>avatarInputRef.current?.click()} style={{position:'absolute',bottom:0,right:0,width:26,height:26,borderRadius:'50%',background:'#E53E3E',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',border:'2px solid #111'}}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M9 1L11 3 4 10H2V8L9 1z" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
                <input ref={avatarInputRef} type="file" accept="image/*" style={{display:'none'}} onChange={e=>{const f=e.target.files?.[0];if(f)uploadAvatar(f)}}/>
              </div>

              {uploadingAvatar&&<div style={{fontSize:12,color:'#6B7280'}}>Fazendo upload...</div>}

              <div style={{width:'100%'}}>
                <label style={{fontSize:10,fontWeight:600,color:'#4B5563',textTransform:'uppercase',letterSpacing:'0.12em',display:'block',marginBottom:6}}>Nome</label>
                <input value={editName} onChange={e=>setEditName(e.target.value)} style={{padding:'10px 14px',background:'#0D0D0D',border:'1px solid rgba(255,255,255,0.08)',borderRadius:8,color:'#F9FAFB',fontSize:13,outline:'none',width:'100%',fontFamily:'Montserrat,sans-serif'}}/>
              </div>

              <div style={{width:'100%',background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.05)',borderRadius:8,padding:'10px 14px'}}>
                <div style={{fontSize:10,color:'#4B5563',textTransform:'uppercase',letterSpacing:'0.12em',marginBottom:4}}>Nível de acesso</div>
                <div style={{fontSize:13,color:currentUser?.role==='admin'?'#E53E3E':'#9CA3AF',fontWeight:600}}>{currentUser?.role==='admin'?'👑 Administrador':'⚡ Colaborador'}</div>
              </div>

              <button onClick={saveProfile} style={{width:'100%',padding:'11px',borderRadius:10,border:'none',fontSize:13,fontWeight:600,color:'#fff',cursor:'pointer',background:'linear-gradient(135deg,#E53E3E,#B91C1C)'}}>
                Salvar alterações
              </button>
            </div>
          </div>
        </div>
      )}

      {toast&&<Toast msg={toast} onClose={()=>setToast(null)}/>}
    </div>
  )
}
