create table if not exists wa_chats (
  id text primary key,
  phone text not null,
  name text,
  avatar_url text,
  is_group boolean not null default false,
  lead_id uuid references leads(id) on delete set null,
  last_message_at timestamptz,
  last_preview text,
  unread_count int not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists wa_messages (
  id uuid primary key default gen_random_uuid(),
  chat_id text not null references wa_chats(id) on delete cascade,
  wa_message_id text not null unique,
  wa_full_id text,
  from_me boolean not null,
  type text not null default 'text',
  text text,
  media_url text,
  media_mime text,
  media_name text,
  status text not null default 'sent',
  sent_by uuid references auth.users(id),
  ai_generated boolean not null default false,
  sender_name text,
  "timestamp" timestamptz not null,
  raw jsonb,
  created_at timestamptz not null default now()
);
create index if not exists wa_messages_chat_ts on wa_messages (chat_id, "timestamp");
create index if not exists wa_chats_last on wa_chats (last_message_at desc);

alter table wa_chats enable row level security;
alter table wa_messages enable row level security;
drop policy if exists "auth read wa_chats" on wa_chats;
create policy "auth read wa_chats" on wa_chats for select to authenticated using (true);
drop policy if exists "auth read wa_messages" on wa_messages;
create policy "auth read wa_messages" on wa_messages for select to authenticated using (true);

do $$ begin
  alter publication supabase_realtime add table wa_chats;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table wa_messages;
exception when duplicate_object then null; end $$;
