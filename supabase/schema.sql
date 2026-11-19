-- Treino ABC: uma linha por usuário com todo o estado do app (treinos + histórico).
create table if not exists public.gym_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.gym_state enable row level security;

drop policy if exists "gym_state select own" on public.gym_state;
drop policy if exists "gym_state insert own" on public.gym_state;
drop policy if exists "gym_state update own" on public.gym_state;

create policy "gym_state select own" on public.gym_state
  for select using (auth.uid() = user_id);
create policy "gym_state insert own" on public.gym_state
  for insert with check (auth.uid() = user_id);
create policy "gym_state update own" on public.gym_state
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
