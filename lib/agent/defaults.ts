import type { AgentSettings } from '@/types/database'

export const DEFAULT_SETTINGS: AgentSettings = {
  id: 1,
  persona_name: 'Carol',
  extra_info: '',
  business_hours: { start: 8, end: 19 },
  updated_by: null,
  updated_at: '1970-01-01T00:00:00Z',
}
