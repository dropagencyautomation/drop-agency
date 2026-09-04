-- Janelas de tempo do agente, editáveis na tela Agente IA em vez de exigir deploy.
-- human_lock_minutes: silêncio da IA quando alguém responde o lead pelo celular.
-- debounce_ms: espera para agrupar mensagens em rajada antes de a IA responder.
alter table agent_settings add column if not exists human_lock_minutes int not null default 60;
alter table agent_settings add column if not exists debounce_ms int not null default 6000;
