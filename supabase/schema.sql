-- Run this in Supabase SQL Editor.
-- Testing version: public read/write. Later, add auth so only you can edit.

create table if not exists opening_nodes (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references opening_nodes(id) on delete cascade,
  move text not null,
  title text,
  explanation text,
  tags text[] default '{}',
  is_practice_card boolean default true,
  created_at timestamptz default now()
);

alter table opening_nodes enable row level security;

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
