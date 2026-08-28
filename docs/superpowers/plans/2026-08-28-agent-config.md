# Configuração do Agente (sub-projeto B) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cliente edita pelo CRM só campos básicos do agente: nome, horário de atendimento, informações adicionais da empresa e catálogo de produtos (valor, foto). O prompt em si (identidade, tom, comunicação, ICP, fluxo de qualificação, roteamento, handoff) fica inteiro no código do agente.

**Architecture:** Tabelas `agent_settings` (1 linha) e `agent_products`. `SYSTEM_PROMPT` vira `buildSystemPrompt(settings, products)`: esqueleto fixo em código + blocos injetados. Webhook carrega settings uma vez por request; falha de leitura cai nos defaults (que são o prompt atual, byte a byte). UI `/ia` (só admin) com 3 cards; API routes com service role gravam `audit_log`.

**Tech Stack:** Next.js 16 App Router, React 19, Supabase (Postgres + Storage), OpenAI SDK, Vitest (novo, dev).

## Global Constraints

- Comportamento em produção após deploy sem tocar na UI deve ser IDÊNTICO ao atual: defaults da migration = texto atual do prompt.
- O prompt NÃO é editável pelo CRM. Todas as seções atuais (regra para/pra, identidade, arquétipo, sobre a Drop, ICP, segredos, comunicação, fluxo, roteamento, handoff, objeções) ficam em código. O CRM só injeta: nome da persona, horário, um bloco opcional "INFORMAÇÕES ADICIONAIS" e o catálogo.
- Prompt atual proíbe revelar preço. `agent_settings.reveal_prices` default `false`: catálogo injetado sem preço e regra mantida. Só com `true` o bloco de catálogo inclui preço e uma frase liberando informar valores do catálogo.
- Toda escrita de config passa por API route com service role e grava `audit_log`.
- Só `user_profiles.role = 'admin'` edita.
- Estilo de UI: inline styles + classes existentes (`card-premium`, vars `--border`, `--muted-foreground`), igual às páginas atuais. Sem libs novas de UI.
- Commits em português, prefixo `feat:`/`fix:`/`test:`/`docs:`.
- Referências de linha do `lib/openai/agent.ts` são do commit `cf83e8f`.

---

### Task 1: Vitest + migration + tipos

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `supabase/migrations/004_agent_settings.sql`
- Modify: `types/database.ts` (append)

**Interfaces:**
- Produces: tipos `AgentSettings`, `AgentProduct`; script `npm test`.

- [ ] **Step 1: Instalar vitest**

```bash
npm i -D vitest
```

- [ ] **Step 2: Script e config**

`package.json` scripts: adicionar `"test": "vitest run"`.

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: { environment: 'node', include: ['**/*.test.ts'] },
  resolve: { alias: { '@': path.resolve(__dirname) } },
})
```

- [ ] **Step 3: Migration**

`supabase/migrations/004_agent_settings.sql`:
```sql
create table if not exists agent_settings (
  id int primary key default 1 check (id = 1),
  persona_name text not null default 'Carol',
  extra_info text not null default '',
  business_hours jsonb not null default '{"start":8,"end":19}',
  reveal_prices boolean not null default false,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

create table if not exists agent_products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  price text not null default '',
  photo_url text,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table agent_settings enable row level security;
alter table agent_products enable row level security;
create policy "auth read settings" on agent_settings for select to authenticated using (true);
create policy "auth read products" on agent_products for select to authenticated using (true);
-- escrita só via service role (API routes)

-- Seed: 1 linha.
insert into agent_settings (id) values (1) on conflict (id) do nothing;

insert into storage.buckets (id, name, public) values ('agent-products', 'agent-products', true)
on conflict (id) do nothing;
```

Nota: `extra_info` vazio = nenhum bloco extra injetado.

- [ ] **Step 4: Tipos**

Append em `types/database.ts`:
```ts
export interface AgentSettings {
  id: 1
  persona_name: string
  extra_info: string
  business_hours: { start: number; end: number }
  reveal_prices: boolean
  updated_by: string | null
  updated_at: string
}

export interface AgentProduct {
  id: string
  name: string
  description: string
  price: string
  photo_url: string | null
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}
```

- [ ] **Step 5: Verificar**

Run: `npx tsc --noEmit && npm test`
Expected: tsc sem erro; vitest "No test files found" (exit 0 com `--passWithNoTests`; se falhar, use `"test": "vitest run --passWithNoTests"`).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.ts supabase/migrations/004_agent_settings.sql types/database.ts
git commit -m "feat: tabelas agent_settings/agent_products, tipos e vitest"
```

---

### Task 2: Defaults + loader de settings

**Files:**
- Create: `lib/agent/defaults.ts`
- Create: `lib/agent/settings.ts`
- Test: `lib/agent/settings.test.ts`

**Interfaces:**
- Produces:
  - `DEFAULT_SETTINGS: AgentSettings`
  - `resolveSettings(row: Partial<AgentSettings> | null): AgentSettings` — campos inválidos → default.
  - `loadAgentConfig(supabase): Promise<{ settings: AgentSettings; products: AgentProduct[] }>` — nunca lança; erro → defaults + `[]`.

- [ ] **Step 1: Defaults**

`lib/agent/defaults.ts`:
```ts
import type { AgentSettings } from '@/types/database'

export const DEFAULT_SETTINGS: AgentSettings = {
  id: 1,
  persona_name: 'Carol',
  extra_info: '',
  business_hours: { start: 8, end: 19 },
  reveal_prices: false,
  updated_by: null,
  updated_at: '1970-01-01T00:00:00Z',
}
```

- [ ] **Step 2: Teste do resolve/loader**

`lib/agent/settings.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { resolveSettings, loadAgentConfig } from './settings'
import { DEFAULT_SETTINGS } from './defaults'

describe('resolveSettings', () => {
  it('null → defaults', () => {
    expect(resolveSettings(null)).toEqual(DEFAULT_SETTINGS)
  })
  it('campo preenchido vence, persona vazio vira Carol', () => {
    const s = resolveSettings({ persona_name: '  ', extra_info: 'Estacionamento próprio.' })
    expect(s.persona_name).toBe('Carol')
    expect(s.extra_info).toBe('Estacionamento próprio.')
  })
  it('business_hours inválido volta ao default', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(resolveSettings({ business_hours: { start: 'x' } as any }).business_hours).toEqual({ start: 8, end: 19 })
  })
})

describe('loadAgentConfig', () => {
  it('erro no banco → defaults e lista vazia', async () => {
    const boom = async () => { throw new Error('down') }
    const fake = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: boom, order: boom }) }) }) }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await loadAgentConfig(fake as any)
    expect(r.settings).toEqual(DEFAULT_SETTINGS)
    expect(r.products).toEqual([])
  })
})
```

- [ ] **Step 3: Rodar, ver falhar**

Run: `npm test`
Expected: FAIL "Cannot find module './settings'".

- [ ] **Step 4: Implementar**

`lib/agent/settings.ts`:
```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { AgentSettings, AgentProduct } from '@/types/database'
import { DEFAULT_SETTINGS } from './defaults'

export function resolveSettings(row: Partial<AgentSettings> | null): AgentSettings {
  if (!row) return DEFAULT_SETTINGS
  const bh = row.business_hours
  const validBh = !!bh && typeof bh.start === 'number' && typeof bh.end === 'number' && bh.start < bh.end
  const name = typeof row.persona_name === 'string' ? row.persona_name.trim() : ''
  return {
    id: 1,
    persona_name: name || DEFAULT_SETTINGS.persona_name,
    extra_info: typeof row.extra_info === 'string' ? row.extra_info.trim() : '',
    business_hours: validBh ? bh : DEFAULT_SETTINGS.business_hours,
    reveal_prices: row.reveal_prices === true,
    updated_by: row.updated_by ?? null,
    updated_at: row.updated_at ?? DEFAULT_SETTINGS.updated_at,
  }
}

export async function loadAgentConfig(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>
): Promise<{ settings: AgentSettings; products: AgentProduct[] }> {
  let settings = DEFAULT_SETTINGS
  let products: AgentProduct[] = []
  try {
    const { data } = await supabase.from('agent_settings').select('*').eq('id', 1).maybeSingle()
    settings = resolveSettings(data)
  } catch (e) { console.error('[AGENT] settings fallback:', e) }
  try {
    const { data } = await supabase.from('agent_products').select('*').eq('is_active', true).order('sort_order')
    products = (data ?? []) as AgentProduct[]
  } catch (e) { console.error('[AGENT] products fallback:', e) }
  return { settings, products }
}
```

- [ ] **Step 5: Rodar, ver passar**

Run: `npm test`
Expected: 4 passed.

- [ ] **Step 6: Commit**

```bash
git add lib/agent
git commit -m "feat: defaults e loader de configuração do agente"
```

---

### Task 3: `buildSystemPrompt` e persona no agent.ts

**Files:**
- Modify: `lib/openai/agent.ts`
- Test: `lib/openai/agent.test.ts`

**Interfaces:**
- Consumes: `AgentSettings`, `AgentProduct`, `DEFAULT_SETTINGS`.
- Produces:
  - `buildSystemPrompt(settings: AgentSettings, products: AgentProduct[]): string`
  - `processMessage(conversation, userMessage, config: { settings: AgentSettings; products: AgentProduct[] })`
  - `generateLeadSummary(history, qualification, personaName: string)`
  - `generateHandoffGuidance(history, qualification, personaName: string)`

- [ ] **Step 1: Teste**

`lib/openai/agent.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { buildSystemPrompt } from './agent'
import { DEFAULT_SETTINGS } from '@/lib/agent/defaults'

const prod = { id: '1', name: 'Site institucional', description: 'Site de até 5 páginas', price: 'R$ 4.000', photo_url: null, is_active: true, sort_order: 0, created_at: '', updated_at: '' }

describe('buildSystemPrompt', () => {
  it('defaults sem produtos = prompt original', () => {
    const p = buildSystemPrompt(DEFAULT_SETTINGS, [])
    for (const h of ['REGRA ABSOLUTA E INEGOCIÁVEL', 'IDENTIDADE', 'ARQUÉTIPO', 'SOBRE A DROP AGENCY', 'PERFIL IDEAL DE CLIENTE', 'O QUE VOCÊ NUNCA PODE REVELAR', 'COMO VOCÊ DEVE SE COMUNICAR', 'FLUXO DE QUALIFICAÇÃO', 'ROTEAMENTO COMERCIAL', 'GATILHOS DE ESCALADA', 'O QUE VOCÊ NUNCA DEVE FAZER']) {
      expect(p).toContain(h)
    }
    expect(p).toContain('Seu nome é Carol')
    expect(p).not.toContain('CATÁLOGO')
    expect(p).not.toContain('INFORMAÇÕES ADICIONAIS')
  })
  it('injeta nome, horário e informações adicionais', () => {
    const p = buildSystemPrompt({ ...DEFAULT_SETTINGS, persona_name: 'Bia', extra_info: 'Estacionamento próprio.', business_hours: { start: 9, end: 18 } }, [])
    expect(p).toContain('Seu nome é Bia')
    expect(p).toContain('Apresente-se como Bia')
    expect(p).not.toContain('Carol')
    expect(p).toContain('9h às 18h')
    expect(p).toContain('INFORMAÇÕES ADICIONAIS')
    expect(p).toContain('Estacionamento próprio.')
  })
  it('catálogo sem preço quando reveal_prices=false', () => {
    const p = buildSystemPrompt(DEFAULT_SETTINGS, [prod])
    expect(p).toContain('CATÁLOGO')
    expect(p).toContain('Site institucional')
    expect(p).not.toContain('R$ 4.000')
  })
  it('catálogo com preço quando reveal_prices=true', () => {
    const p = buildSystemPrompt({ ...DEFAULT_SETTINGS, reveal_prices: true }, [prod])
    expect(p).toContain('R$ 4.000')
    expect(p).toContain('pode informar os valores do catálogo')
  })
})
```

- [ ] **Step 2: Rodar, ver falhar**

Run: `npm test`
Expected: FAIL "buildSystemPrompt is not a function".

- [ ] **Step 3: Refatorar o prompt (mudança mínima)**

Em `lib/openai/agent.ts`:

1. Trocar `const SYSTEM_PROMPT = \`...\`` por `const SYSTEM_PROMPT_TEMPLATE = (name: string) => \`...\`` com o MESMO texto, substituindo cada ocorrência literal de "Carol" dentro do template por `${name}` (linhas 6, 19 duas vezes, 136). Nada mais muda no texto.

2. Acrescentar antes de `processMessage`:
```ts
import type { AgentSettings, AgentProduct } from '@/types/database'

const SEP = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'

function hoursBlock(s: AgentSettings): string {
  return `${SEP}
HORÁRIO DE ATENDIMENTO
${SEP}
A empresa atende das ${s.business_hours.start}h às ${s.business_hours.end}h (horário de Brasília). Fora desse horário, avise que o time humano responde no próximo horário comercial e siga a conversa normalmente.`
}

function extraInfoBlock(s: AgentSettings): string {
  if (!s.extra_info) return ''
  return `${SEP}
INFORMAÇÕES ADICIONAIS DA EMPRESA (fornecidas pelo time, use quando fizer sentido)
${SEP}
${s.extra_info}`
}

function catalogBlock(s: AgentSettings, products: AgentProduct[]): string {
  if (products.length === 0) return ''
  const lines = products.map(p =>
    `- ${p.name}${p.description ? `: ${p.description}` : ''}${s.reveal_prices && p.price ? ` (${p.price})` : ''}`
  )
  const rule = s.reveal_prices
    ? 'Você pode informar os valores do catálogo acima quando o lead perguntar. Serviços fora do catálogo continuam sem valor, orçados na sessão estratégica.'
    : 'Use o catálogo só para entender e descrever o que a empresa oferece. Continua valendo a regra de nunca informar valores.'
  return `${SEP}
CATÁLOGO DE PRODUTOS E SERVIÇOS
${SEP}
${lines.join('\n')}

${rule}`
}

export function buildSystemPrompt(settings: AgentSettings, products: AgentProduct[]): string {
  return [
    SYSTEM_PROMPT_TEMPLATE(settings.persona_name),
    hoursBlock(settings),
    extraInfoBlock(settings),
    catalogBlock(settings, products),
  ].filter(Boolean).join('\n\n')
}
```

- [ ] **Step 4: Persona nas funções auxiliares**

Trocar `'Carol'` hardcoded fora do template:
- linhas 323 e 366: `m.role === 'user' ? 'Lead' : personaName`
- linha 325: `` `${personaName}: ${assistantReply}` ``
- `EXTRACTION_SYSTEM_PROMPT`, `SUMMARY_SYSTEM_PROMPT`, `GUIDANCE_SYSTEM_PROMPT` (linhas 228–290): onde aparece "Carol", virar função `(name: string) => \`...\`` com `${name}`.

Assinaturas:
```ts
async function extractQualificationData(history, userMessage, assistantReply, personaName: string)
export async function generateLeadSummary(history, qualification, personaName: string)
export async function generateHandoffGuidance(history, qualification, personaName: string)
export async function processMessage(
  conversation: AiConversation,
  userMessage: string,
  config: { settings: AgentSettings; products: AgentProduct[] }
)
```
Dentro de `processMessage`: `{ role: 'system', content: buildSystemPrompt(config.settings, config.products) }` e `extractQualificationData(..., config.settings.persona_name)`.

- [ ] **Step 5: Rodar**

Run: `npm test && npx tsc --noEmit`
Expected: testes passam; tsc falha só em `app/api/webhook/whatsapp/route.ts` (chamadas antigas) — corrigido na Task 4.

- [ ] **Step 6: Commit**

```bash
git add lib/openai/agent.ts lib/openai/agent.test.ts
git commit -m "feat: prompt do agente recebe nome, horário, informações extras e catálogo"
```

---

### Task 4: Webhook e notificação usam settings

**Files:**
- Modify: `app/api/webhook/whatsapp/route.ts:5,211,260,278-279`
- Modify: `lib/uazapi/client.ts:113-122`

**Interfaces:**
- Consumes: `loadAgentConfig`, novas assinaturas da Task 3.
- Produces: `notifyQualifiedLead(leadPhone, summary, guidance, personaName: string)`.

- [ ] **Step 1: Webhook**

Import: `import { loadAgentConfig } from '@/lib/agent/settings'`.
Logo após `const supabase = await createServiceClient()`:
```ts
const agentConfig = await loadAgentConfig(supabase)
const personaName = agentConfig.settings.persona_name
```
Chamadas:
- `processMessage(conversation, message, agentConfig)` (manter os dois primeiros args como estão hoje).
- `generateLeadSummary(finalHistory, updatedQualification, personaName)` (2 ocorrências).
- `generateHandoffGuidance(finalHistory, updatedQualification, personaName)`.
- `notifyQualifiedLead(phone, summary, guidance, personaName)`.

- [ ] **Step 2: Uazapi notify**

```ts
export async function notifyQualifiedLead(leadPhone: string, summary: string, guidance: string, personaName = 'Carol') {
  ...
  `o lead: ${leadPhone} foi qualificado pela agente de IA ${personaName}\n\n` +
```

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: tudo limpo.

- [ ] **Step 4: Commit**

```bash
git add app/api/webhook/whatsapp/route.ts lib/uazapi/client.ts
git commit -m "feat: webhook carrega configuração do agente por request"
```

---

### Task 5: API routes de settings, produtos e upload

**Files:**
- Create: `lib/agent/admin.ts`
- Create: `app/api/agent/settings/route.ts`
- Create: `app/api/agent/products/route.ts`
- Create: `app/api/agent/products/upload/route.ts`

**Interfaces:**
- Produces:
  - `requireAdmin(): Promise<{ ok: true; userId: string; name: string } | { ok: false; res: NextResponse }>`
  - `GET /api/agent/settings` → `{ settings: AgentSettings, products: AgentProduct[] }`
  - `PATCH /api/agent/settings` body `Partial<Pick<AgentSettings,'persona_name'|'extra_info'|'business_hours'|'reveal_prices'>>` → `{ settings }`
  - `POST /api/agent/settings` body `{ action: 'reset' }` → `persona_name='Carol'`, `extra_info=''`, horário 8–19, `reveal_prices=false`.
  - `POST /api/agent/products` body `{ name, description?, price?, photo_url?, is_active?, sort_order? }` → `{ product }`
  - `PATCH /api/agent/products` body `{ id, ...campos }` → `{ product }`
  - `DELETE /api/agent/products?id=` → `{ success: true }`
  - `POST /api/agent/products/upload` multipart `file` → `{ url }`

- [ ] **Step 1: requireAdmin**

`lib/agent/admin.ts`:
```ts
import { NextResponse } from 'next/server'
import { createClient as createSsr } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

export function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function requireAdmin() {
  const ssr = await createSsr()
  const { data: { user } } = await ssr.auth.getUser()
  if (!user) return { ok: false as const, res: NextResponse.json({ error: 'Não autenticado' }, { status: 401 }) }
  const { data: profile } = await adminClient().from('user_profiles').select('role,name,is_active').eq('id', user.id).single()
  if (!profile || !profile.is_active || profile.role !== 'admin') {
    return { ok: false as const, res: NextResponse.json({ error: 'Somente administradores' }, { status: 403 }) }
  }
  return { ok: true as const, userId: user.id, name: profile.name as string }
}

export async function audit(userId: string, userName: string, action: string, resource: string, resourceId: string | null, details: unknown) {
  await adminClient().from('audit_log').insert({ user_id: userId, user_name: userName, action, resource, resource_id: resourceId, details })
}
```

- [ ] **Step 2: settings route**

`app/api/agent/settings/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, adminClient, audit } from '@/lib/agent/admin'
import { loadAgentConfig } from '@/lib/agent/settings'
export const dynamic = 'force-dynamic'
const EDITABLE = ['persona_name', 'extra_info', 'business_hours', 'reveal_prices'] as const

export async function GET() {
  const auth = await requireAdmin(); if (!auth.ok) return auth.res
  const { settings, products } = await loadAgentConfig(adminClient())
  return NextResponse.json({ settings, products })
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(); if (!auth.ok) return auth.res
  const body = await req.json()
  const update: Record<string, unknown> = {}
  for (const k of EDITABLE) if (k in body) update[k] = body[k]
  if (typeof update.persona_name === 'string' && !update.persona_name.trim()) return NextResponse.json({ error: 'Nome obrigatório' }, { status: 400 })
  if (update.business_hours) {
    const bh = update.business_hours as { start?: unknown; end?: unknown }
    if (typeof bh.start !== 'number' || typeof bh.end !== 'number' || bh.start < 0 || bh.end > 24 || bh.start >= bh.end) {
      return NextResponse.json({ error: 'Horário inválido' }, { status: 400 })
    }
  }
  update.updated_by = auth.userId; update.updated_at = new Date().toISOString()
  const { data, error } = await adminClient().from('agent_settings').update(update).eq('id', 1).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  await audit(auth.userId, auth.name, 'UPDATE_AGENT_SETTINGS', 'agent_settings', '1', update)
  return NextResponse.json({ settings: data })
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(); if (!auth.ok) return auth.res
  const { action } = await req.json()
  if (action !== 'reset') return NextResponse.json({ error: 'Ação inválida' }, { status: 400 })
  const reset = { persona_name: 'Carol', extra_info: '', business_hours: { start: 8, end: 19 }, reveal_prices: false, updated_by: auth.userId, updated_at: new Date().toISOString() }
  const { error } = await adminClient().from('agent_settings').update(reset).eq('id', 1)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  await audit(auth.userId, auth.name, 'RESET_AGENT_SETTINGS', 'agent_settings', '1', null)
  return NextResponse.json({ success: true })
}
```

- [ ] **Step 3: products route**

`app/api/agent/products/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, adminClient, audit } from '@/lib/agent/admin'

export const dynamic = 'force-dynamic'
const FIELDS = ['name', 'description', 'price', 'photo_url', 'is_active', 'sort_order'] as const

function pick(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {}
  for (const k of FIELDS) if (k in body) out[k] = body[k]
  return out
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(); if (!auth.ok) return auth.res
  const body = pick(await req.json())
  if (typeof body.name !== 'string' || !body.name.trim()) return NextResponse.json({ error: 'Nome obrigatório' }, { status: 400 })
  const { data, error } = await adminClient().from('agent_products').insert(body).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  await audit(auth.userId, auth.name, 'CREATE_AGENT_PRODUCT', 'agent_products', data.id, body)
  return NextResponse.json({ product: data })
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(); if (!auth.ok) return auth.res
  const { id, ...rest } = await req.json()
  if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })
  const body = { ...pick(rest), updated_at: new Date().toISOString() }
  const { data, error } = await adminClient().from('agent_products').update(body).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  await audit(auth.userId, auth.name, 'UPDATE_AGENT_PRODUCT', 'agent_products', id, body)
  return NextResponse.json({ product: data })
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(); if (!auth.ok) return auth.res
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })
  const { error } = await adminClient().from('agent_products').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  await audit(auth.userId, auth.name, 'DELETE_AGENT_PRODUCT', 'agent_products', id, null)
  return NextResponse.json({ success: true })
}
```

- [ ] **Step 4: upload route**

`app/api/agent/products/upload/route.ts` — mesmo padrão de `app/api/upload-avatar/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, adminClient } from '@/lib/agent/admin'

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(); if (!auth.ok) return auth.res
  const form = await req.formData()
  const file = form.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'file obrigatório' }, { status: 400 })
  if (!file.type.startsWith('image/')) return NextResponse.json({ error: 'Apenas imagens' }, { status: 400 })
  if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: 'Máximo 5MB' }, { status: 400 })
  const supabase = adminClient()
  const { data: buckets } = await supabase.storage.listBuckets()
  if (!buckets?.some(b => b.name === 'agent-products')) {
    await supabase.storage.createBucket('agent-products', { public: true, fileSizeLimit: 5242880 })
  }
  const ext = file.name.split('.').pop() ?? 'jpg'
  const path = `${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from('agent-products').upload(path, await file.arrayBuffer(), { contentType: file.type })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const { data: { publicUrl } } = supabase.storage.from('agent-products').getPublicUrl(path)
  return NextResponse.json({ url: publicUrl })
}
```

- [ ] **Step 5: Verificar**

Run: `npx tsc --noEmit && npm run lint`
Expected: limpo. Smoke local (dev server ligado, logado como admin no browser): `curl -s http://localhost:3000/api/agent/settings` sem cookie → 401.

- [ ] **Step 6: Commit**

```bash
git add lib/agent/admin.ts app/api/agent
git commit -m "feat: API de configuração do agente (settings, produtos, upload)"
```

---

### Task 6: Tela `/ia` → "Agente IA"

**Files:**
- Modify: `app/(crm)/ia/page.tsx` (server: gate admin, passa dados)
- Create: `app/(crm)/ia/AgentConfigClient.tsx`
- Create: `app/(crm)/ia/ProductsCard.tsx`
- Modify: `components/layout/Sidebar.tsx:36` (label `'Agente IA'`)

**Interfaces:**
- Consumes: rotas da Task 5, tipos `AgentSettings`/`AgentProduct`.

- [ ] **Step 1: Page server**

`app/(crm)/ia/page.tsx`:
```tsx
import Topbar from '@/components/layout/Topbar'
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/agent/admin'
import { resolveSettings } from '@/lib/agent/settings'
import type { AgentProduct } from '@/types/database'
import AgentConfigClient from './AgentConfigClient'

export const dynamic = 'force-dynamic'

export default async function IaPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user!.id).single()
  const isAdmin = profile?.role === 'admin'
  const admin = adminClient()
  const { data: row } = await admin.from('agent_settings').select('*').eq('id', 1).maybeSingle()
  const { data: products } = await admin.from('agent_products').select('*').order('sort_order')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <Topbar title="Agente IA" subtitle="Nome, horário, informações da empresa e catálogo usados pelo agente no WhatsApp" />
      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
        {isAdmin ? (
          <AgentConfigClient initialSettings={resolveSettings(row)} initialProducts={(products ?? []) as AgentProduct[]} />
        ) : (
          <p style={{ color: 'var(--muted-foreground)', fontSize: 13 }}>Somente administradores podem editar o agente.</p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Client principal**

`app/(crm)/ia/AgentConfigClient.tsx`:
```tsx
'use client'
import { useState } from 'react'
import type { AgentSettings, AgentProduct } from '@/types/database'
import ProductsCard from './ProductsCard'

const card: React.CSSProperties = { padding: 20, marginBottom: 20 }
const label: React.CSSProperties = { display: 'block', fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: 6 }
const input: React.CSSProperties = { width: '100%', padding: '10px 12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#F9FAFB', fontSize: 13, fontFamily: 'inherit', outline: 'none' }
const btn: React.CSSProperties = { padding: '10px 16px', borderRadius: 8, border: 'none', background: '#E0332B', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }
const btnGhost: React.CSSProperties = { ...btn, background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: 'var(--muted-foreground)' }

export default function AgentConfigClient({ initialSettings, initialProducts }: { initialSettings: AgentSettings; initialProducts: AgentProduct[] }) {
  const [s, setS] = useState(initialSettings)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  const set = <K extends keyof AgentSettings>(k: K, v: AgentSettings[K]) => setS(p => ({ ...p, [k]: v }))

  async function save() {
    setSaving(true); setMsg('')
    const res = await fetch('/api/agent/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ persona_name: s.persona_name, extra_info: s.extra_info, business_hours: s.business_hours, reveal_prices: s.reveal_prices }) })
    const j = await res.json()
    setMsg(res.ok ? 'Salvo. Vale a partir da próxima mensagem recebida.' : j.error ?? 'Erro')
    setSaving(false)
  }

  async function reset() {
    if (!confirm('Restaurar nome, horário e informações para o padrão?')) return
    setSaving(true)
    await fetch('/api/agent/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reset' }) })
    setS(p => ({ ...p, persona_name: 'Carol', extra_info: '', business_hours: { start: 8, end: 19 }, reveal_prices: false }))
    setMsg('Padrão restaurado.'); setSaving(false)
  }

  return (
    <div style={{ maxWidth: 860 }}>
      <div className="card-premium" style={card}>
        <h3 style={{ margin: '0 0 14px', fontSize: 14 }}>Agente</h3>
        <label style={label}>Nome do agente</label>
        <input style={{ ...input, marginBottom: 14 }} value={s.persona_name} onChange={e => set('persona_name', e.target.value)} />
        <div style={{ display: 'flex', gap: 12, alignItems: 'end', marginBottom: 14 }}>
          <div><label style={label}>Abre (h)</label><input type="number" min={0} max={23} style={{ ...input, width: 90 }} value={s.business_hours.start} onChange={e => set('business_hours', { ...s.business_hours, start: Number(e.target.value) })} /></div>
          <div><label style={label}>Fecha (h)</label><input type="number" min={1} max={24} style={{ ...input, width: 90 }} value={s.business_hours.end} onChange={e => set('business_hours', { ...s.business_hours, end: Number(e.target.value) })} /></div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, marginLeft: 16 }}>
            <input type="checkbox" checked={s.reveal_prices} onChange={e => set('reveal_prices', e.target.checked)} />
            Agente pode informar valores do catálogo
          </label>
        </div>
        <label style={label}>Informações adicionais da empresa (endereço, formas de contato, avisos)</label>
        <textarea style={{ ...input, minHeight: 120 }} value={s.extra_info} onChange={e => set('extra_info', e.target.value)} />
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 28 }}>
        <button style={btn} disabled={saving} onClick={save}>{saving ? 'Salvando...' : 'Salvar'}</button>
        <button style={btnGhost} disabled={saving} onClick={reset}>Restaurar padrão</button>
        {msg && <span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>{msg}</span>}
      </div>

      <ProductsCard initial={initialProducts} styles={{ card, label, input, btn, btnGhost }} />
    </div>
  )
}
```

- [ ] **Step 3: Produtos**

`app/(crm)/ia/ProductsCard.tsx`:
```tsx
'use client'
import { useState } from 'react'
import type { AgentProduct } from '@/types/database'

type Styles = Record<'card' | 'label' | 'input' | 'btn' | 'btnGhost', React.CSSProperties>
const empty = { name: '', description: '', price: '', photo_url: null as string | null, is_active: true }

export default function ProductsCard({ initial, styles: st }: { initial: AgentProduct[]; styles: Styles }) {
  const [items, setItems] = useState(initial)
  const [form, setForm] = useState<typeof empty & { id?: string }>(empty)
  const [busy, setBusy] = useState(false)

  async function upload(file: File) {
    const fd = new FormData(); fd.append('file', file)
    const res = await fetch('/api/agent/products/upload', { method: 'POST', body: fd })
    const j = await res.json()
    if (res.ok) setForm(f => ({ ...f, photo_url: j.url })); else alert(j.error)
  }

  async function submit() {
    if (!form.name.trim()) return alert('Nome obrigatório')
    setBusy(true)
    const method = form.id ? 'PATCH' : 'POST'
    const res = await fetch('/api/agent/products', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    const j = await res.json()
    if (!res.ok) { alert(j.error); setBusy(false); return }
    setItems(list => form.id ? list.map(p => p.id === form.id ? j.product : p) : [...list, j.product])
    setForm(empty); setBusy(false)
  }

  async function remove(id: string) {
    if (!confirm('Remover produto?')) return
    await fetch(`/api/agent/products?id=${id}`, { method: 'DELETE' })
    setItems(list => list.filter(p => p.id !== id))
  }

  return (
    <div className="card-premium" style={st.card}>
      <h3 style={{ margin: '0 0 14px', fontSize: 14 }}>Produtos e serviços</h3>
      {items.map(p => (
        <div key={p.id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)', opacity: p.is_active ? 1 : 0.5 }}>
          {p.photo_url ? <img src={p.photo_url} alt="" style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover' }} /> : <div style={{ width: 44, height: 44, borderRadius: 8, background: 'rgba(255,255,255,0.06)' }} />}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{p.name} {p.price && <span style={{ color: 'var(--muted-foreground)', fontWeight: 400 }}>· {p.price}</span>}</div>
            <div style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>{p.description}</div>
          </div>
          <button style={st.btnGhost} onClick={() => setForm({ id: p.id, name: p.name, description: p.description, price: p.price, photo_url: p.photo_url, is_active: p.is_active })}>Editar</button>
          <button style={st.btnGhost} onClick={() => remove(p.id)}>Remover</button>
        </div>
      ))}
      {items.length === 0 && <p style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>Nenhum produto cadastrado.</p>}

      <div style={{ marginTop: 18, display: 'grid', gap: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 600 }}>{form.id ? 'Editar produto' : 'Novo produto'}</div>
        <input style={st.input} placeholder="Nome" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        <input style={st.input} placeholder="Valor (ex: R$ 2.500 ou a partir de R$ 900/mês)" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} />
        <textarea style={{ ...st.input, minHeight: 70 }} placeholder="Descrição" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <input type="file" accept="image/*" onChange={e => e.target.files?.[0] && upload(e.target.files[0])} />
          {form.photo_url && <img src={form.photo_url} alt="" style={{ width: 36, height: 36, borderRadius: 6, objectFit: 'cover' }} />}
          <label style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} />Ativo</label>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button style={st.btn} disabled={busy} onClick={submit}>{form.id ? 'Salvar' : 'Adicionar'}</button>
          {form.id && <button style={st.btnGhost} onClick={() => setForm(empty)}>Cancelar</button>}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Sidebar**

`components/layout/Sidebar.tsx:36`: `{ href: '/ia', label: 'Agente IA', icon: CpuIcon }`.

- [ ] **Step 5: Verificar no browser**

Run: `npx tsc --noEmit && npm run lint`. Abrir `http://localhost:3000/ia` logado como admin: editar nome para "Bia", salvar, recarregar → persiste. Adicionar produto com foto → aparece na lista e em `agent_products`. "Restaurar padrão" → nome volta a Carol. Logar como colaborador → mensagem "Somente administradores".

`<img>` gera warning do eslint-config-next (`@next/next/no-img-element`); aceitar com `// eslint-disable-next-line @next/next/no-img-element` nas duas linhas.

- [ ] **Step 6: Commit**

```bash
git add "app/(crm)/ia" components/layout/Sidebar.tsx
git commit -m "feat: tela Agente IA para editar nome, horário, informações e catálogo"
```

---

### Task 7: Deploy e validação em produção

**Files:** nenhum novo. Checklist.

- [ ] **Step 1: Migration em produção**

Supabase Dashboard → SQL Editor → colar `supabase/migrations/004_agent_settings.sql` → Run. Conferir: `select * from agent_settings` retorna 1 linha.

- [ ] **Step 2: Push e rebuild**

```bash
git push origin main
```
EasyPanel → drop-agency → drop-crm → Deploy (rebuild). Aguardar "Running".

- [ ] **Step 3: Regressão do agente**

De um número da whitelist, mandar "oi" para o WhatsApp da Drop. Esperado: Carol se apresenta como Carol, mesmo tom de antes. Logs do serviço no EasyPanel sem `[AGENT] settings fallback`.

- [ ] **Step 4: Alteração real**

Em `/ia` produção: mudar nome para "Carol" → "Carol" (sem mudança) e adicionar 1 produto de teste inativo. Mandar mensagem, confirmar resposta normal. Remover produto de teste.

- [ ] **Step 5: Registrar**

Atualizar `docs/superpowers/specs/2026-08-28-whatsapp-inbox-agent-config-design.md` seção B com "Implementado em <data>, commit <hash>".

```bash
git add docs && git commit -m "docs: marca sub-projeto B como implementado" && git push
```
