import type { AgentSettings } from '@/types/database'

export const DEFAULT_SETTINGS: AgentSettings = {
  id: 1,
  persona_name: 'Carol',
  extra_info: '',
  business_hours: { start: 0, end: 24 }, // 24/7: a Drop atende a qualquer hora, todos os dias
  human_lock_minutes: 60,
  debounce_ms: 6000,
  updated_by: null,
  updated_at: '1970-01-01T00:00:00Z',
}
