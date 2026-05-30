-- =============================================
-- DROP AGENCY — Schema inicial
-- =============================================

-- =============================================
-- REFERÊNCIAS (tabelas sem FK externa)
-- =============================================

CREATE TABLE pipeline_stages (
  id          SERIAL PRIMARY KEY,
  name        TEXT    NOT NULL,
  order_index INTEGER NOT NULL UNIQUE,
  color       TEXT    NOT NULL DEFAULT '#6366f1',
  description TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO pipeline_stages (name, order_index, color) VALUES
  ('Lead Entrou',                          1, '#94a3b8'),
  ('Atendimento Inicial / Qualificação',   2, '#60a5fa'),
  ('Envio Valores',                        3, '#f59e0b'),
  ('Agendamento Sessão Estratégica',       4, '#a78bfa'),
  ('Proposta',                             5, '#f97316'),
  ('Fechamento',                           6, '#10b981'),
  ('Nutrição x Follow Up',                 7, '#06b6d4'),
  ('Sem Resposta',                         8, '#ef4444'),
  ('Declinou',                             9, '#6b7280');

-- ----------------------

CREATE TABLE loss_reasons (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO loss_reasons (name) VALUES
  ('Achou caro / sem orçamento'),
  ('Sem timing'),
  ('Não respondeu'),
  ('Fora do ICP'),
  ('Fechou com concorrente'),
  ('Preferiu aguardar'),
  ('Outro');

-- =============================================
-- LEADS
-- =============================================

CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Contato
  name   TEXT NOT NULL,
  phone  TEXT NOT NULL UNIQUE,
  email  TEXT,

  -- Empresa
  company_name     TEXT,
  niche            TEXT,
  revenue_range    TEXT CHECK (revenue_range IN ('<50k', '50k-100k', '100k-500k', '500k+')),
  team_size        TEXT,
  digital_maturity TEXT CHECK (digital_maturity IN ('nenhuma', 'basica', 'intermediaria', 'avancada')),

  -- Contexto comercial
  service_type      TEXT CHECK (service_type IN ('pontual', 'recorrente', 'indefinido')),
  desired_service   TEXT,
  main_objective    TEXT,
  urgency           TEXT CHECK (urgency IN ('imediata', 'curto_prazo', 'medio_prazo', 'sem_urgencia')),
  has_marketing     BOOLEAN,
  main_pains        TEXT,
  growth_goals      TEXT,
  estimated_budget  TEXT,

  -- Origem e perfil
  source  TEXT CHECK (source IN ('whatsapp', 'instagram', 'indicacao', 'networking', 'meta_ads', 'google_ads', 'outro')),
  profile TEXT CHECK (profile IN ('quente', 'sem_timing', 'curioso', 'sem_orcamento', 'estrategico', 'recorrente', 'pontual')),
  score   INTEGER DEFAULT 0 CHECK (score BETWEEN 0 AND 100),

  -- Pipeline
  stage_id    INTEGER REFERENCES pipeline_stages(id) DEFAULT 1,
  is_active   BOOLEAN DEFAULT TRUE,

  -- Responsável (para SDR futuro)
  assigned_to UUID REFERENCES auth.users(id),

  -- Timestamps
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW(),
  last_interaction_at  TIMESTAMPTZ
);

-- =============================================
-- HISTÓRICO DE PIPELINE
-- =============================================

CREATE TABLE lead_stage_history (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id  UUID REFERENCES leads(id) ON DELETE CASCADE,
  stage_id INTEGER REFERENCES pipeline_stages(id),
  moved_by UUID REFERENCES auth.users(id), -- NULL = IA
  notes    TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- PERDAS
-- =============================================

CREATE TABLE lead_losses (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id   UUID REFERENCES leads(id) ON DELETE CASCADE,
  reason_id INTEGER REFERENCES loss_reasons(id),
  notes     TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- INTERAÇÕES (mensagens, chamadas, e-mails)
-- =============================================

CREATE TABLE interactions (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id   UUID REFERENCES leads(id) ON DELETE CASCADE,
  channel   TEXT NOT NULL CHECK (channel IN ('whatsapp', 'instagram', 'email', 'call', 'manual')),
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  content   TEXT NOT NULL,
  sent_by   UUID REFERENCES auth.users(id), -- NULL = IA
  ai_generated BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- ESTADO DA CONVERSA DA IA (WhatsApp)
-- =============================================

CREATE TABLE ai_conversations (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id              UUID REFERENCES leads(id) ON DELETE CASCADE,
  whatsapp_number      TEXT NOT NULL UNIQUE,
  conversation_history JSONB DEFAULT '[]'::JSONB,
  qualification_data   JSONB DEFAULT '{}'::JSONB,
  current_step         TEXT DEFAULT 'greeting',
  -- greeting → collecting_info → qualifying → routing → closed
  is_active            BOOLEAN DEFAULT TRUE,
  human_takeover       BOOLEAN DEFAULT FALSE,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- FOLLOW-UPS AGENDADOS
-- =============================================

CREATE TABLE follow_ups (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id        UUID REFERENCES leads(id) ON DELETE CASCADE,
  follow_up_day  INTEGER NOT NULL, -- 1, 3, 7, 14, 21, 30, 0 = nutrição
  scheduled_at   TIMESTAMPTZ NOT NULL,
  status         TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'cancelled', 'failed')),
  content        TEXT,
  sent_at        TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- NPS
-- =============================================

CREATE TABLE nps_responses (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id          UUID REFERENCES leads(id) ON DELETE CASCADE,
  service_quality  INTEGER CHECK (service_quality BETWEEN 0 AND 10),
  delivery_quality INTEGER CHECK (delivery_quality BETWEEN 0 AND 10),
  on_time          INTEGER CHECK (on_time BETWEEN 0 AND 10),
  recommendation   INTEGER CHECK (recommendation BETWEEN 0 AND 10),
  would_refer      BOOLEAN,
  referral_name    TEXT,
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- TRIGGERS — updated_at automático
-- =============================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER ai_conversations_updated_at
  BEFORE UPDATE ON ai_conversations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================
-- RLS (Row Level Security)
-- =============================================

ALTER TABLE leads               ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_stage_history  ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_losses         ENABLE ROW LEVEL SECURITY;
ALTER TABLE interactions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_conversations    ENABLE ROW LEVEL SECURITY;
ALTER TABLE follow_ups          ENABLE ROW LEVEL SECURITY;
ALTER TABLE nps_responses       ENABLE ROW LEVEL SECURITY;

-- Acesso total para usuários autenticados (equipe interna)
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'leads', 'lead_stage_history', 'lead_losses',
    'interactions', 'ai_conversations', 'follow_ups', 'nps_responses'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY "team_full_access" ON %I FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE)',
      t
    );
  END LOOP;
END $$;

-- Webhook da IA pode inserir/atualizar sem autenticação (service_role via backend)
-- O backend usa SUPABASE_SERVICE_ROLE_KEY, então não precisa de policy extra.

-- =============================================
-- ÍNDICES para performance
-- =============================================

CREATE INDEX idx_leads_stage_id     ON leads(stage_id);
CREATE INDEX idx_leads_phone        ON leads(phone);
CREATE INDEX idx_leads_created_at   ON leads(created_at DESC);
CREATE INDEX idx_leads_score        ON leads(score DESC);
CREATE INDEX idx_interactions_lead  ON interactions(lead_id, created_at DESC);
CREATE INDEX idx_follow_ups_status  ON follow_ups(status, scheduled_at);
CREATE INDEX idx_ai_conv_phone      ON ai_conversations(whatsapp_number);
