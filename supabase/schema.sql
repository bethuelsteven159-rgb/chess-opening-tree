-- Run this in the Supabase SQL Editor.
-- The current policies stay open for solo testing. Lock them down once you finish setup.

create table if not exists opening_nodes (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references opening_nodes(id) on delete cascade,
  move text not null,
  title text default '',
  explanation text default '',
  highlight_kind text default '',
  tags text[] default '{}',
  is_practice_card boolean default true,
  exclude_from_training boolean default false,
  is_preferred boolean default false,
  created_at timestamptz default now()
);

alter table opening_nodes add column if not exists title text default '';
alter table opening_nodes add column if not exists explanation text default '';
alter table opening_nodes add column if not exists highlight_kind text default '';
alter table opening_nodes add column if not exists tags text[] default '{}';
alter table opening_nodes add column if not exists is_practice_card boolean default true;
alter table opening_nodes add column if not exists exclude_from_training boolean default false;
alter table opening_nodes add column if not exists is_preferred boolean default false;
alter table opening_nodes add column if not exists created_at timestamptz default now();

update opening_nodes
set exclude_from_training = not coalesce(is_practice_card, true)
where exclude_from_training is distinct from not coalesce(is_practice_card, true);

create table if not exists repair_items (
  id uuid primary key default gen_random_uuid(),
  related_node_id uuid references opening_nodes(id) on delete set null,
  position_path text default '',
  mistake text not null default '',
  lesson text not null default '',
  repair text not null default '',
  status text not null default 'needs_work' check (status in ('needs_work', 'solved')),
  created_at timestamptz default now()
);

alter table repair_items add column if not exists related_node_id uuid references opening_nodes(id) on delete set null;
alter table repair_items add column if not exists position_path text default '';
alter table repair_items add column if not exists mistake text not null default '';
alter table repair_items add column if not exists lesson text not null default '';
alter table repair_items add column if not exists repair text not null default '';
alter table repair_items add column if not exists status text not null default 'needs_work';
alter table repair_items add column if not exists created_at timestamptz default now();

alter table opening_nodes enable row level security;
alter table repair_items enable row level security;

drop policy if exists "Allow public read" on opening_nodes;
drop policy if exists "Allow public insert" on opening_nodes;
drop policy if exists "Allow public update" on opening_nodes;
drop policy if exists "Allow public delete" on opening_nodes;

create policy "Allow public read"
on opening_nodes for select
using (true);

create policy "Allow public insert"
on opening_nodes for insert
with check (true);

create policy "Allow public update"
on opening_nodes for update
using (true);

create policy "Allow public delete"
on opening_nodes for delete
using (true);

drop policy if exists "Allow public read" on repair_items;
drop policy if exists "Allow public insert" on repair_items;
drop policy if exists "Allow public update" on repair_items;
drop policy if exists "Allow public delete" on repair_items;

create policy "Allow public read"
on repair_items for select
using (true);

create policy "Allow public insert"
on repair_items for insert
with check (true);

create policy "Allow public update"
on repair_items for update
using (true);

create policy "Allow public delete"
on repair_items for delete
using (true);
