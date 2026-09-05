-- Origem do nome do lead: decide quem pode sobrescrever.
--   crm              digitado por humano no CRM — nunca sobrescrito automaticamente
--   stated           o lead escreveu o proprio nome na conversa (com guarda)
--   whatsapp_profile nome do contato no WhatsApp ao criar o lead
--   phone            fallback (telefone como nome)
alter table leads add column if not exists name_source text not null default 'phone';

-- Telefone so com digitos, para achar o mesmo assinante em qualquer formato
-- (com/sem 55, com/sem nono digito, com pontuacao vinda de formulario).
alter table leads add column if not exists phone_digits text
  generated always as (regexp_replace(coalesce(phone, ''), '\D', '', 'g')) stored;
create index if not exists leads_phone_digits_idx on leads (phone_digits);

-- Leads antigos criados pelo webhook: nome == telefone -> origem 'phone';
-- os demais ja tinham nome humano ou extraido; marcamos como 'stated' (a IA
-- pode continuar corrigindo) e nao como 'crm'.
update leads set name_source = 'phone' where name = phone and name_source = 'phone';
update leads set name_source = 'stated' where name <> phone and name_source = 'phone';
