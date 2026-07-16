-- Clear all stored WhatsApp conversation memory used by the AI agent.
-- Keeps CRM leads intact, but removes chat history and resets AI conversation state.

DELETE FROM interactions
WHERE channel = 'whatsapp';

UPDATE ai_conversations
SET
  conversation_history = '[]'::jsonb,
  qualification_data = '{}'::jsonb,
  current_step = 'greeting',
  human_takeover = false,
  updated_at = now();

UPDATE leads
SET
  summary = NULL,
  last_interaction_at = NULL,
  updated_at = now()
WHERE summary IS NOT NULL
   OR last_interaction_at IS NOT NULL;
