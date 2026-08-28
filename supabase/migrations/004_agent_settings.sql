create table if not exists agent_settings (
  id int primary key default 1 check (id = 1),
  persona_name text not null default 'Carol',
  extra_info text not null default '',
  business_hours jsonb not null default '{"start":8,"end":19}',
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
