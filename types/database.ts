export type RevenueRange = '<50k' | '50k-100k' | '100k-500k' | '500k+'
export type DigitalMaturity = 'nenhuma' | 'basica' | 'intermediaria' | 'avancada'
export type ServiceType = 'pontual' | 'recorrente' | 'indefinido'
export type Urgency = 'imediata' | 'curto_prazo' | 'medio_prazo' | 'sem_urgencia'
export type LeadSource = 'whatsapp' | 'instagram' | 'indicacao' | 'networking' | 'meta_ads' | 'google_ads' | 'outro'
export type LeadProfile = 'quente' | 'sem_timing' | 'curioso' | 'sem_orcamento' | 'estrategico' | 'recorrente' | 'pontual'
export type InteractionChannel = 'whatsapp' | 'instagram' | 'email' | 'call' | 'manual'
export type InteractionDirection = 'inbound' | 'outbound'
export type FollowUpStatus = 'pending' | 'sent' | 'cancelled' | 'failed'
export type ConversationStep = 'greeting' | 'collecting_info' | 'qualifying' | 'routing' | 'closed'

export interface PipelineStage {
  id: number
  name: string
  order_index: number
  color: string
  description: string | null
  created_at: string
}

export interface LossReason {
  id: number
  name: string
  created_at: string
}

export interface Lead {
  id: string
  name: string
  phone: string
  email: string | null
  company_name: string | null
  niche: string | null
  revenue_range: RevenueRange | null
  team_size: string | null
  digital_maturity: DigitalMaturity | null
  service_type: ServiceType | null
  desired_service: string | null
  main_objective: string | null
  urgency: Urgency | null
  has_marketing: boolean | null
  main_pains: string | null
  growth_goals: string | null
  estimated_budget: string | null
  source: LeadSource | null
  profile: LeadProfile | null
  score: number
  stage_id: number
  is_active: boolean
  assigned_to: string | null
  created_at: string
  updated_at: string
  last_interaction_at: string | null
  pipeline_stages?: PipelineStage
}

export interface LeadStageHistory {
  id: string
  lead_id: string
  stage_id: number
  moved_by: string | null
  notes: string | null
  created_at: string
  pipeline_stages?: PipelineStage
}

export interface LeadLoss {
  id: string
  lead_id: string
  reason_id: number
  notes: string | null
  created_at: string
  loss_reasons?: LossReason
}

export interface Interaction {
  id: string
  lead_id: string
  channel: InteractionChannel
  direction: InteractionDirection
  content: string
  sent_by: string | null
  ai_generated: boolean
  created_at: string
}

export interface QualificationData {
  name?: string
  niche?: string
  service_type?: ServiceType
  desired_service?: string
  main_objective?: string
  urgency?: Urgency
  revenue_range?: RevenueRange
  team_size?: string
  digital_maturity?: DigitalMaturity
  has_marketing?: boolean
  main_pains?: string
  growth_goals?: string
  estimated_budget?: string
  strategic_openness?: boolean
}

export interface AiConversation {
  id: string
  lead_id: string
  whatsapp_number: string
  conversation_history: Array<{ role: 'user' | 'assistant'; content: string; timestamp: string }>
  qualification_data: QualificationData
  current_step: ConversationStep
  is_active: boolean
  human_takeover: boolean
  created_at: string
  updated_at: string
}

export interface FollowUp {
  id: string
  lead_id: string
  follow_up_day: number
  scheduled_at: string
  status: FollowUpStatus
  content: string | null
  sent_at: string | null
  created_at: string
}

export interface NpsResponse {
  id: string
  lead_id: string
  service_quality: number | null
  delivery_quality: number | null
  on_time: number | null
  recommendation: number | null
  would_refer: boolean | null
  referral_name: string | null
  notes: string | null
  created_at: string
}

// Tipos usados no CRM frontend
export interface LeadWithStage extends Lead {
  pipeline_stages: PipelineStage
}

export interface KanbanColumn {
  stage: PipelineStage
  leads: LeadWithStage[]
}
