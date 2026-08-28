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
