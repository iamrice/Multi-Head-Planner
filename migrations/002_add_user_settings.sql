-- =========================================================
-- PlanMate — 用户设置表
-- 在 Supabase Dashboard → SQL Editor 中执行
-- =========================================================

-- 4. user_settings 表（用户级别设置，如列宽）
create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  cell_width int not null default 80 check (cell_width >= 40 and cell_width <= 200),
  updated_at timestamptz not null default now()
);

alter table public.user_settings enable row level security;

create policy "Users can manage own settings"
  on public.user_settings for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- updated_at 自动更新触发器
create trigger user_settings_updated_at
  before update on public.user_settings
  for each row execute procedure public.update_updated_at();
