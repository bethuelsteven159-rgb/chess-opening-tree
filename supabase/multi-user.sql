-- Multi-user migration: run in the Supabase SQL Editor before inviting users.
-- Existing single-user rows belong to the original account, never the caller.
begin;
do $$
declare
  table_name text;
  policy_row record;
  original_owner uuid;
  has_legacy_rows boolean;
begin
  select id into original_owner from auth.users
    where lower(email) = 'bethuelsteven159@gmail.com' limit 1;
  foreach table_name in array array[
    'opening_nodes', 'repair_items', 'games', 'game_annotations', 'positions',
    'mistakes', 'support_cards', 'goals', 'app_reminders', 'books', 'book_notes',
    'tournament_notes', 'quick_ideas', 'review_items', 'repair_attempts'
  ] loop
    execute format('alter table public.%I add column if not exists user_id uuid references auth.users(id)', table_name);
    execute format('select exists(select 1 from public.%I where user_id is null)', table_name) into has_legacy_rows;
    if has_legacy_rows and original_owner is null then
      raise exception 'Original owner account missing. Restore the original account before migrating existing study data.';
    end if;
    execute format('update public.%I set user_id = $1 where user_id is null', table_name) using original_owner;
    execute format('alter table public.%I alter column user_id set default auth.uid(), alter column user_id set not null', table_name);
    execute format('create index if not exists %I on public.%I(user_id)', table_name || '_user_id_idx', table_name);
    execute format('alter table public.%I enable row level security', table_name);
    -- Permissive policies combine with OR, so remove every previous policy.
    for policy_row in select policyname from pg_policies
      where schemaname = 'public' and tablename = table_name
    loop
      execute format('drop policy %I on public.%I', policy_row.policyname, table_name);
    end loop;
    execute format('create policy "Users manage own data" on public.%I for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', table_name);
  end loop;
end $$;

-- Foreign keys also need ownership checks: a user must not link a row to
-- another user's game, node, or note (including links with cascade deletes).
create or replace function public.check_study_link_owner()
returns trigger language plpgsql set search_path = public as $$
declare
  link record;
  linked_id uuid;
  same_owner boolean;
begin
  for link in
    select a.attname, c.confrelid::regclass as target_table
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f' and c.conrelid = TG_RELID
      and array_length(c.conkey, 1) = 1
      and c.confrelid in (
        select attrelid from pg_attribute where attname = 'user_id'
          and not attisdropped and attrelid in (
            select oid from pg_class where relnamespace = 'public'::regnamespace
          )
      )
  loop
    linked_id := (to_jsonb(NEW) ->> link.attname)::uuid;
    if linked_id is not null then
      execute format('select exists(select 1 from %s where id = $1 and user_id = $2)', link.target_table)
        into same_owner using linked_id, NEW.user_id;
      if not same_owner then
        raise exception 'Study links must belong to the same account' using errcode = '23503';
      end if;
    end if;
  end loop;
  return NEW;
end $$;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'opening_nodes', 'repair_items', 'games', 'game_annotations', 'positions',
    'mistakes', 'support_cards', 'goals', 'app_reminders', 'books', 'book_notes',
    'tournament_notes', 'quick_ideas', 'review_items', 'repair_attempts'
  ] loop
    execute format('drop trigger if exists check_study_link_owner on public.%I', table_name);
    execute format('create trigger check_study_link_owner before insert or update on public.%I for each row execute function public.check_study_link_owner()', table_name);
  end loop;
end $$;
commit;
