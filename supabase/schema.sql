-- Run this in the Supabase SQL Editor.
-- The policies below stay open for solo use while you are still shaping the app.

create extension if not exists pgcrypto;

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

create table if not exists games (
  id uuid primary key default gen_random_uuid(),
  event text default '',
  site text default '',
  date text default '',
  round text default '',
  time_control text default '',
  platform text default '',
  user_color text not null default 'white' check (user_color in ('white', 'black')),
  white_player text default '',
  black_player text default '',
  result text default '*',
  opening_name text default '',
  eco text default '',
  pgn text default '',
  final_fen text default '',
  summary text default '',
  tags text[] default '{}',
  analysis_status text not null default 'imported_only'
    check (analysis_status in (
      'imported_only',
      'quick_classified',
      'human_analysis_started',
      'human_analysis_complete',
      'engine_checked_later',
      'lessons_extracted',
      'repairs_created'
    )),
  linked_opening_node_id uuid references opening_nodes(id) on delete set null,
  linked_opening_title text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table games add column if not exists event text default '';
alter table games add column if not exists site text default '';
alter table games add column if not exists date text default '';
alter table games add column if not exists round text default '';
alter table games add column if not exists time_control text default '';
alter table games add column if not exists platform text default '';
alter table games add column if not exists user_color text not null default 'white';
alter table games add column if not exists white_player text default '';
alter table games add column if not exists black_player text default '';
alter table games add column if not exists result text default '*';
alter table games add column if not exists opening_name text default '';
alter table games add column if not exists eco text default '';
alter table games add column if not exists pgn text default '';
alter table games add column if not exists final_fen text default '';
alter table games add column if not exists summary text default '';
alter table games add column if not exists tags text[] default '{}';
alter table games add column if not exists analysis_status text not null default 'imported_only';
alter table games add column if not exists linked_opening_node_id uuid references opening_nodes(id) on delete set null;
alter table games add column if not exists linked_opening_title text default '';
alter table games add column if not exists created_at timestamptz default now();
alter table games add column if not exists updated_at timestamptz default now();

create table if not exists positions (
  id uuid primary key default gen_random_uuid(),
  fen text default '',
  pgn_context text default '',
  side_to_move text not null default 'w' check (side_to_move in ('w', 'b')),
  move_number integer,
  source_type text default '',
  source_id uuid,
  title text default '',
  short_question text default '',
  position_type text not null default 'middlegame'
    check (position_type in ('opening', 'middlegame', 'endgame', 'tactic', 'defense', 'conversion', 'strategy')),
  themes text[] default '{}',
  tags text[] default '{}',
  difficulty text default '',
  priority text default '',
  human_evaluation text default '',
  correct_idea text default '',
  wrong_idea text default '',
  candidate_moves text[] default '{}',
  best_human_move text default '',
  lesson text default '',
  linked_repair_id uuid references repair_items(id) on delete set null,
  linked_opening_node_id uuid references opening_nodes(id) on delete set null,
  linked_game_id uuid references games(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table positions add column if not exists fen text default '';
alter table positions add column if not exists pgn_context text default '';
alter table positions add column if not exists side_to_move text not null default 'w';
alter table positions add column if not exists move_number integer;
alter table positions add column if not exists source_type text default '';
alter table positions add column if not exists source_id uuid;
alter table positions add column if not exists title text default '';
alter table positions add column if not exists short_question text default '';
alter table positions add column if not exists position_type text not null default 'middlegame';
alter table positions add column if not exists themes text[] default '{}';
alter table positions add column if not exists tags text[] default '{}';
alter table positions add column if not exists difficulty text default '';
alter table positions add column if not exists priority text default '';
alter table positions add column if not exists human_evaluation text default '';
alter table positions add column if not exists correct_idea text default '';
alter table positions add column if not exists wrong_idea text default '';
alter table positions add column if not exists candidate_moves text[] default '{}';
alter table positions add column if not exists best_human_move text default '';
alter table positions add column if not exists lesson text default '';
alter table positions add column if not exists linked_repair_id uuid references repair_items(id) on delete set null;
alter table positions add column if not exists linked_opening_node_id uuid references opening_nodes(id) on delete set null;
alter table positions add column if not exists linked_game_id uuid references games(id) on delete set null;
alter table positions add column if not exists created_at timestamptz default now();
alter table positions add column if not exists updated_at timestamptz default now();

create table if not exists mistakes (
  id uuid primary key default gen_random_uuid(),
  title text default '',
  source_type text default '',
  source_id uuid,
  position_id uuid references positions(id) on delete set null,
  linked_opening_node_id uuid references opening_nodes(id) on delete set null,
  move_number integer,
  category text not null default 'calculation'
    check (category in (
      'opening',
      'calculation',
      'tactics',
      'strategy',
      'endgame',
      'time_management',
      'psychology_emotion',
      'conversion',
      'defense'
    )),
  cause text default '',
  severity text not null default 'medium' check (severity in ('small', 'medium', 'serious', 'game_losing')),
  phase text not null default 'middlegame' check (phase in ('opening', 'middlegame', 'endgame')),
  side text not null default 'white' check (side in ('white', 'black')),
  what_i_played text default '',
  what_i_missed text default '',
  why_it_happened text default '',
  correct_thinking_rule text default '',
  recurrence_key text default '',
  tags text[] default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table mistakes add column if not exists title text default '';
alter table mistakes add column if not exists source_type text default '';
alter table mistakes add column if not exists source_id uuid;
alter table mistakes add column if not exists position_id uuid references positions(id) on delete set null;
alter table mistakes add column if not exists linked_opening_node_id uuid references opening_nodes(id) on delete set null;
alter table mistakes add column if not exists move_number integer;
alter table mistakes add column if not exists category text not null default 'calculation';
alter table mistakes add column if not exists cause text default '';
alter table mistakes add column if not exists severity text not null default 'medium';
alter table mistakes add column if not exists phase text not null default 'middlegame';
alter table mistakes add column if not exists side text not null default 'white';
alter table mistakes add column if not exists what_i_played text default '';
alter table mistakes add column if not exists what_i_missed text default '';
alter table mistakes add column if not exists why_it_happened text default '';
alter table mistakes add column if not exists correct_thinking_rule text default '';
alter table mistakes add column if not exists recurrence_key text default '';
alter table mistakes add column if not exists tags text[] default '{}';
alter table mistakes add column if not exists created_at timestamptz default now();
alter table mistakes add column if not exists updated_at timestamptz default now();

create table if not exists game_annotations (
  id uuid primary key default gen_random_uuid(),
  game_id uuid references games(id) on delete cascade,
  move_number integer,
  ply integer not null default 0,
  san text default '',
  from_square text default '',
  to_square text default '',
  fen_before text default '',
  fen_after text default '',
  human_comment_before text default '',
  human_comment_after text default '',
  candidate_moves text[] default '{}',
  rejected_candidate_moves text[] default '{}',
  expected_reply text default '',
  actual_reply text default '',
  evaluation_human text default '',
  confidence_level text default '',
  emotional_state text default '',
  is_critical boolean default false,
  critical_type text default '',
  mistake_flag boolean default false,
  lesson_flag boolean default false,
  position_id uuid references positions(id) on delete set null,
  mistake_id uuid references mistakes(id) on delete set null,
  repair_id uuid references repair_items(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table game_annotations add column if not exists game_id uuid references games(id) on delete cascade;
alter table game_annotations add column if not exists move_number integer;
alter table game_annotations add column if not exists ply integer not null default 0;
alter table game_annotations add column if not exists san text default '';
alter table game_annotations add column if not exists from_square text default '';
alter table game_annotations add column if not exists to_square text default '';
alter table game_annotations add column if not exists fen_before text default '';
alter table game_annotations add column if not exists fen_after text default '';
alter table game_annotations add column if not exists human_comment_before text default '';
alter table game_annotations add column if not exists human_comment_after text default '';
alter table game_annotations add column if not exists candidate_moves text[] default '{}';
alter table game_annotations add column if not exists rejected_candidate_moves text[] default '{}';
alter table game_annotations add column if not exists expected_reply text default '';
alter table game_annotations add column if not exists actual_reply text default '';
alter table game_annotations add column if not exists evaluation_human text default '';
alter table game_annotations add column if not exists confidence_level text default '';
alter table game_annotations add column if not exists emotional_state text default '';
alter table game_annotations add column if not exists is_critical boolean default false;
alter table game_annotations add column if not exists critical_type text default '';
alter table game_annotations add column if not exists mistake_flag boolean default false;
alter table game_annotations add column if not exists lesson_flag boolean default false;
alter table game_annotations add column if not exists position_id uuid references positions(id) on delete set null;
alter table game_annotations add column if not exists mistake_id uuid references mistakes(id) on delete set null;
alter table game_annotations add column if not exists repair_id uuid references repair_items(id) on delete set null;
alter table game_annotations add column if not exists created_at timestamptz default now();
alter table game_annotations add column if not exists updated_at timestamptz default now();

create index if not exists opening_nodes_parent_idx on opening_nodes(parent_id);
create index if not exists repair_items_related_node_idx on repair_items(related_node_id);
create index if not exists games_opening_idx on games(linked_opening_node_id);
create index if not exists positions_game_idx on positions(linked_game_id);
create index if not exists positions_opening_idx on positions(linked_opening_node_id);
create index if not exists positions_repair_idx on positions(linked_repair_id);
create index if not exists mistakes_position_idx on mistakes(position_id);
create index if not exists mistakes_opening_idx on mistakes(linked_opening_node_id);
create index if not exists game_annotations_game_idx on game_annotations(game_id);
create index if not exists game_annotations_position_idx on game_annotations(position_id);
create index if not exists game_annotations_mistake_idx on game_annotations(mistake_id);
create index if not exists game_annotations_repair_idx on game_annotations(repair_id);

alter table opening_nodes enable row level security;
alter table repair_items enable row level security;
alter table games enable row level security;
alter table positions enable row level security;
alter table mistakes enable row level security;
alter table game_annotations enable row level security;

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

drop policy if exists "Allow public read" on games;
drop policy if exists "Allow public insert" on games;
drop policy if exists "Allow public update" on games;
drop policy if exists "Allow public delete" on games;

create policy "Allow public read"
on games for select
using (true);

create policy "Allow public insert"
on games for insert
with check (true);

create policy "Allow public update"
on games for update
using (true);

create policy "Allow public delete"
on games for delete
using (true);

drop policy if exists "Allow public read" on positions;
drop policy if exists "Allow public insert" on positions;
drop policy if exists "Allow public update" on positions;
drop policy if exists "Allow public delete" on positions;

create policy "Allow public read"
on positions for select
using (true);

create policy "Allow public insert"
on positions for insert
with check (true);

create policy "Allow public update"
on positions for update
using (true);

create policy "Allow public delete"
on positions for delete
using (true);

drop policy if exists "Allow public read" on mistakes;
drop policy if exists "Allow public insert" on mistakes;
drop policy if exists "Allow public update" on mistakes;
drop policy if exists "Allow public delete" on mistakes;

create policy "Allow public read"
on mistakes for select
using (true);

create policy "Allow public insert"
on mistakes for insert
with check (true);

create policy "Allow public update"
on mistakes for update
using (true);

create policy "Allow public delete"
on mistakes for delete
using (true);

drop policy if exists "Allow public read" on game_annotations;
drop policy if exists "Allow public insert" on game_annotations;
drop policy if exists "Allow public update" on game_annotations;
drop policy if exists "Allow public delete" on game_annotations;

create policy "Allow public read"
on game_annotations for select
using (true);

create policy "Allow public insert"
on game_annotations for insert
with check (true);

create policy "Allow public update"
on game_annotations for update
using (true);

create policy "Allow public delete"
on game_annotations for delete
using (true);
