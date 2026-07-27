-- =========================================================
-- PlanMate — 数据库初始化 SQL
-- 在 Supabase Dashboard → SQL Editor 中执行
-- =========================================================

-- 1. cards 表
create table if not exists public.cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default '新任务',
  start_date date not null default current_date,
  duration_days int not null default 7 check (duration_days >= 1),
  row_position int not null default 0,
  color_index int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.cards enable row level security;

create policy "Users can CRUD own cards"
  on public.cards for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index cards_user_id_idx on public.cards(user_id, row_position);

-- 2. daily_records 表
create table if not exists public.daily_records (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards(id) on delete cascade,
  date date not null,
  row_index int not null default 0,
  content text not null default '',
  completed boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.daily_records enable row level security;

create policy "Users can CRUD own daily_records"
  on public.daily_records for all
  using (
    exists (
      select 1 from public.cards
      where cards.id = daily_records.card_id
      and cards.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.cards
      where cards.id = daily_records.card_id
      and cards.user_id = auth.uid()
    )
  );

create index daily_records_card_id_date_idx
  on public.daily_records(card_id, date, row_index);

-- 3. updated_at 自动更新触发器
create or replace function public.update_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger cards_updated_at
  before update on public.cards
  for each row execute procedure public.update_updated_at();
