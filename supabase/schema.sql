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

create table if not exists support_cards (
  id uuid primary key default gen_random_uuid(),
  title text default '',
  body text default '',
  card_type text not null default 'note'
    check (card_type in ('identity', 'principle', 'quote', 'anti_tilt', 'advice', 'checklist', 'mindset', 'study_rule', 'tournament', 'note')),
  category text not null default 'other'
    check (category in ('vision', 'discipline', 'emotional_control', 'study_process', 'tournament_strength', 'confidence', 'recovery', 'other')),
  pinned boolean default false,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'critical')),
  tags text[] default '{}',
  source text default '',
  source_url text default '',
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  last_reviewed_at timestamptz,
  review_count integer default 0
);

alter table support_cards add column if not exists title text default '';
alter table support_cards add column if not exists body text default '';
alter table support_cards add column if not exists card_type text not null default 'note';
alter table support_cards add column if not exists category text not null default 'other';
alter table support_cards add column if not exists pinned boolean default false;
alter table support_cards add column if not exists priority text not null default 'normal';
alter table support_cards add column if not exists tags text[] default '{}';
alter table support_cards add column if not exists source text default '';
alter table support_cards add column if not exists source_url text default '';
alter table support_cards add column if not exists status text not null default 'active';
alter table support_cards add column if not exists created_at timestamptz default now();
alter table support_cards add column if not exists updated_at timestamptz default now();
alter table support_cards add column if not exists last_reviewed_at timestamptz;
alter table support_cards add column if not exists review_count integer default 0;

create table if not exists books (
  id uuid primary key default gen_random_uuid(),
  title text default '',
  author text default '',
  format text not null default 'book'
    check (format in ('book', 'pdf', 'course', 'video_series', 'article', 'website', 'other')),
  status text not null default 'want_to_read'
    check (status in ('want_to_read', 'currently_reading', 'paused', 'finished', 'dropped', 'reference')),
  area text not null default 'general'
    check (area in ('opening', 'middlegame', 'endgame', 'tactics', 'calculation', 'strategy', 'game_collection', 'psychology', 'tournament_play', 'biography', 'general', 'other')),
  reason text default '',
  what_it_teaches text default '',
  current_page integer,
  total_pages integer,
  progress_percent numeric,
  started_at text default '',
  target_finish_date text default '',
  finished_at text default '',
  rating integer,
  key_lessons text default '',
  action_items text default '',
  source_url text default '',
  file_label text default '',
  tags text[] default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table books add column if not exists title text default '';
alter table books add column if not exists author text default '';
alter table books add column if not exists format text not null default 'book';
alter table books add column if not exists status text not null default 'want_to_read';
alter table books add column if not exists area text not null default 'general';
alter table books add column if not exists reason text default '';
alter table books add column if not exists what_it_teaches text default '';
alter table books add column if not exists current_page integer;
alter table books add column if not exists total_pages integer;
alter table books add column if not exists progress_percent numeric;
alter table books add column if not exists started_at text default '';
alter table books add column if not exists target_finish_date text default '';
alter table books add column if not exists finished_at text default '';
alter table books add column if not exists rating integer;
alter table books add column if not exists key_lessons text default '';
alter table books add column if not exists action_items text default '';
alter table books add column if not exists source_url text default '';
alter table books add column if not exists file_label text default '';
alter table books add column if not exists tags text[] default '{}';
alter table books add column if not exists created_at timestamptz default now();
alter table books add column if not exists updated_at timestamptz default now();

create table if not exists goals (
  id uuid primary key default gen_random_uuid(),
  title text default '',
  goal_type text not null default 'custom'
    check (goal_type in ('ultimate', 'annual', 'quarterly', 'monthly', 'rating', 'tournament', 'book', 'process', 'mindset', 'custom')),
  description text default '',
  why text default '',
  success_criteria text default '',
  current_value numeric,
  target_value numeric,
  unit text default '',
  manual_progress_percent numeric,
  target_date text default '',
  status text not null default 'active' check (status in ('not_started', 'active', 'paused', 'achieved', 'abandoned')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'critical')),
  parent_goal_id uuid references goals(id) on delete set null,
  linked_book_id uuid references books(id) on delete set null,
  linked_support_card_ids text[] default '{}',
  tags text[] default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  completed_at timestamptz,
  last_touched_at timestamptz
);

alter table goals add column if not exists title text default '';
alter table goals add column if not exists goal_type text not null default 'custom';
alter table goals add column if not exists description text default '';
alter table goals add column if not exists why text default '';
alter table goals add column if not exists success_criteria text default '';
alter table goals add column if not exists current_value numeric;
alter table goals add column if not exists target_value numeric;
alter table goals add column if not exists unit text default '';
alter table goals add column if not exists manual_progress_percent numeric;
alter table goals add column if not exists target_date text default '';
alter table goals add column if not exists status text not null default 'active';
alter table goals add column if not exists priority text not null default 'normal';
alter table goals add column if not exists parent_goal_id uuid references goals(id) on delete set null;
alter table goals add column if not exists linked_book_id uuid references books(id) on delete set null;
alter table goals add column if not exists linked_support_card_ids text[] default '{}';
alter table goals add column if not exists tags text[] default '{}';
alter table goals add column if not exists created_at timestamptz default now();
alter table goals add column if not exists updated_at timestamptz default now();
alter table goals add column if not exists completed_at timestamptz;
alter table goals add column if not exists last_touched_at timestamptz;

create table if not exists app_reminders (
  id uuid primary key default gen_random_uuid(),
  title text default '',
  note text default '',
  reminder_type text not null default 'custom'
    check (reminder_type in ('goal', 'book', 'tournament', 'admin', 'mindset', 'review', 'custom')),
  due_date text default '',
  due_time text default '',
  repeat_rule text not null default 'none' check (repeat_rule in ('none', 'daily', 'weekly', 'monthly', 'custom_days')),
  repeat_interval integer default 1,
  repeat_days text[] default '{}',
  status text not null default 'active' check (status in ('active', 'done', 'snoozed', 'archived')),
  snooze_until text default '',
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'critical')),
  linked_goal_id uuid references goals(id) on delete set null,
  linked_book_id uuid references books(id) on delete set null,
  linked_support_card_id uuid references support_cards(id) on delete set null,
  tags text[] default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  completed_at timestamptz
);

alter table app_reminders add column if not exists title text default '';
alter table app_reminders add column if not exists note text default '';
alter table app_reminders add column if not exists reminder_type text not null default 'custom';
alter table app_reminders add column if not exists due_date text default '';
alter table app_reminders add column if not exists due_time text default '';
alter table app_reminders add column if not exists repeat_rule text not null default 'none';
alter table app_reminders add column if not exists repeat_interval integer default 1;
alter table app_reminders add column if not exists repeat_days text[] default '{}';
alter table app_reminders add column if not exists status text not null default 'active';
alter table app_reminders add column if not exists snooze_until text default '';
alter table app_reminders add column if not exists priority text not null default 'normal';
alter table app_reminders add column if not exists linked_goal_id uuid references goals(id) on delete set null;
alter table app_reminders add column if not exists linked_book_id uuid references books(id) on delete set null;
alter table app_reminders add column if not exists linked_support_card_id uuid references support_cards(id) on delete set null;
alter table app_reminders add column if not exists tags text[] default '{}';
alter table app_reminders add column if not exists created_at timestamptz default now();
alter table app_reminders add column if not exists updated_at timestamptz default now();
alter table app_reminders add column if not exists completed_at timestamptz;

create table if not exists book_notes (
  id uuid primary key default gen_random_uuid(),
  book_id uuid references books(id) on delete cascade,
  title text default '',
  page text default '',
  chapter text default '',
  note text default '',
  lesson text default '',
  action_item text default '',
  tags text[] default '{}',
  linked_opening_node_id uuid references opening_nodes(id) on delete set null,
  linked_position_id uuid references positions(id) on delete set null,
  linked_repair_id uuid references repair_items(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table book_notes add column if not exists book_id uuid references books(id) on delete cascade;
alter table book_notes add column if not exists title text default '';
alter table book_notes add column if not exists page text default '';
alter table book_notes add column if not exists chapter text default '';
alter table book_notes add column if not exists note text default '';
alter table book_notes add column if not exists lesson text default '';
alter table book_notes add column if not exists action_item text default '';
alter table book_notes add column if not exists tags text[] default '{}';
alter table book_notes add column if not exists linked_opening_node_id uuid references opening_nodes(id) on delete set null;
alter table book_notes add column if not exists linked_position_id uuid references positions(id) on delete set null;
alter table book_notes add column if not exists linked_repair_id uuid references repair_items(id) on delete set null;
alter table book_notes add column if not exists created_at timestamptz default now();
alter table book_notes add column if not exists updated_at timestamptz default now();

create table if not exists tournament_notes (
  id uuid primary key default gen_random_uuid(),
  event_name text default '',
  event_date text default '',
  event_location text default '',
  time_control text default '',
  section text default '',
  status text not null default 'planned' check (status in ('planned', 'active', 'completed', 'cancelled')),
  pre_event_goal text default '',
  opening_focus text default '',
  mental_focus text default '',
  practical_checklist text default '',
  round_notes text default '',
  after_event_lessons text default '',
  linked_goal_id uuid references goals(id) on delete set null,
  tags text[] default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table tournament_notes add column if not exists event_name text default '';
alter table tournament_notes add column if not exists event_date text default '';
alter table tournament_notes add column if not exists event_location text default '';
alter table tournament_notes add column if not exists time_control text default '';
alter table tournament_notes add column if not exists section text default '';
alter table tournament_notes add column if not exists status text not null default 'planned';
alter table tournament_notes add column if not exists pre_event_goal text default '';
alter table tournament_notes add column if not exists opening_focus text default '';
alter table tournament_notes add column if not exists mental_focus text default '';
alter table tournament_notes add column if not exists practical_checklist text default '';
alter table tournament_notes add column if not exists round_notes text default '';
alter table tournament_notes add column if not exists after_event_lessons text default '';
alter table tournament_notes add column if not exists linked_goal_id uuid references goals(id) on delete set null;
alter table tournament_notes add column if not exists tags text[] default '{}';
alter table tournament_notes add column if not exists created_at timestamptz default now();
alter table tournament_notes add column if not exists updated_at timestamptz default now();

create table if not exists quick_ideas (
  id uuid primary key default gen_random_uuid(),
  title text default '',
  body text default '',
  idea_type text not null default 'general'
    check (idea_type in ('general', 'opening', 'training', 'book', 'mindset', 'tournament', 'app_improvement', 'other')),
  status text not null default 'inbox' check (status in ('inbox', 'converted', 'archived')),
  converted_to_type text default '',
  converted_to_id text default '',
  tags text[] default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table quick_ideas add column if not exists title text default '';
alter table quick_ideas add column if not exists body text default '';
alter table quick_ideas add column if not exists idea_type text not null default 'general';
alter table quick_ideas add column if not exists status text not null default 'inbox';
alter table quick_ideas add column if not exists converted_to_type text default '';
alter table quick_ideas add column if not exists converted_to_id text default '';
alter table quick_ideas add column if not exists tags text[] default '{}';
alter table quick_ideas add column if not exists created_at timestamptz default now();
alter table quick_ideas add column if not exists updated_at timestamptz default now();

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
create index if not exists support_cards_updated_idx on support_cards(updated_at);
create index if not exists goals_parent_idx on goals(parent_goal_id);
create index if not exists goals_book_idx on goals(linked_book_id);
create index if not exists app_reminders_goal_idx on app_reminders(linked_goal_id);
create index if not exists app_reminders_book_idx on app_reminders(linked_book_id);
create index if not exists app_reminders_support_card_idx on app_reminders(linked_support_card_id);
create index if not exists book_notes_book_idx on book_notes(book_id);
create index if not exists tournament_notes_goal_idx on tournament_notes(linked_goal_id);

alter table opening_nodes enable row level security;
alter table repair_items enable row level security;
alter table games enable row level security;
alter table positions enable row level security;
alter table mistakes enable row level security;
alter table game_annotations enable row level security;
alter table support_cards enable row level security;
alter table goals enable row level security;
alter table app_reminders enable row level security;
alter table books enable row level security;
alter table book_notes enable row level security;
alter table tournament_notes enable row level security;
alter table quick_ideas enable row level security;

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

drop policy if exists "Allow public read" on support_cards;
drop policy if exists "Allow public insert" on support_cards;
drop policy if exists "Allow public update" on support_cards;
drop policy if exists "Allow public delete" on support_cards;

create policy "Allow public read"
on support_cards for select
using (true);

create policy "Allow public insert"
on support_cards for insert
with check (true);

create policy "Allow public update"
on support_cards for update
using (true);

create policy "Allow public delete"
on support_cards for delete
using (true);

drop policy if exists "Allow public read" on books;
drop policy if exists "Allow public insert" on books;
drop policy if exists "Allow public update" on books;
drop policy if exists "Allow public delete" on books;

create policy "Allow public read"
on books for select
using (true);

create policy "Allow public insert"
on books for insert
with check (true);

create policy "Allow public update"
on books for update
using (true);

create policy "Allow public delete"
on books for delete
using (true);

drop policy if exists "Allow public read" on goals;
drop policy if exists "Allow public insert" on goals;
drop policy if exists "Allow public update" on goals;
drop policy if exists "Allow public delete" on goals;

create policy "Allow public read"
on goals for select
using (true);

create policy "Allow public insert"
on goals for insert
with check (true);

create policy "Allow public update"
on goals for update
using (true);

create policy "Allow public delete"
on goals for delete
using (true);

drop policy if exists "Allow public read" on app_reminders;
drop policy if exists "Allow public insert" on app_reminders;
drop policy if exists "Allow public update" on app_reminders;
drop policy if exists "Allow public delete" on app_reminders;

create policy "Allow public read"
on app_reminders for select
using (true);

create policy "Allow public insert"
on app_reminders for insert
with check (true);

create policy "Allow public update"
on app_reminders for update
using (true);

create policy "Allow public delete"
on app_reminders for delete
using (true);

drop policy if exists "Allow public read" on book_notes;
drop policy if exists "Allow public insert" on book_notes;
drop policy if exists "Allow public update" on book_notes;
drop policy if exists "Allow public delete" on book_notes;

create policy "Allow public read"
on book_notes for select
using (true);

create policy "Allow public insert"
on book_notes for insert
with check (true);

create policy "Allow public update"
on book_notes for update
using (true);

create policy "Allow public delete"
on book_notes for delete
using (true);

drop policy if exists "Allow public read" on tournament_notes;
drop policy if exists "Allow public insert" on tournament_notes;
drop policy if exists "Allow public update" on tournament_notes;
drop policy if exists "Allow public delete" on tournament_notes;

create policy "Allow public read"
on tournament_notes for select
using (true);

create policy "Allow public insert"
on tournament_notes for insert
with check (true);

create policy "Allow public update"
on tournament_notes for update
using (true);

create policy "Allow public delete"
on tournament_notes for delete
using (true);

drop policy if exists "Allow public read" on quick_ideas;
drop policy if exists "Allow public insert" on quick_ideas;
drop policy if exists "Allow public update" on quick_ideas;
drop policy if exists "Allow public delete" on quick_ideas;

create policy "Allow public read"
on quick_ideas for select
using (true);

create policy "Allow public insert"
on quick_ideas for insert
with check (true);

create policy "Allow public update"
on quick_ideas for update
using (true);

create policy "Allow public delete"
on quick_ideas for delete
using (true);
