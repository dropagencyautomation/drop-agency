alter table wa_messages add column if not exists deleted_at timestamptz;
alter table wa_messages add column if not exists deleted_by uuid references auth.users(id);
