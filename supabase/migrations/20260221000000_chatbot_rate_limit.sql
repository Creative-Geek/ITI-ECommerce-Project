-- Chatbot rate limiting (user-based)
-- Used by Supabase Edge Function: supabase/functions/chatbot/index.ts

create table if not exists public.chat_rate_limits (
  user_id uuid primary key references auth.users (id) on delete cascade,
  window_start timestamptz not null default now(),
  count int not null default 0,
  updated_at timestamptz not null default now()
);

-- Restrict direct access from anon/authenticated users
alter table public.chat_rate_limits enable row level security;

-- No policies: only service role (Edge Function using service key) can access.

create or replace function public.check_and_increment_chat_rate_limit(
  p_user_id uuid,
  p_window_seconds int,
  p_max_count int
)
returns table (
  allowed boolean,
  remaining int,
  reset_at timestamptz
)
language plpgsql
security definer
as $$
declare
  v_now timestamptz := now();
  v_window_start timestamptz;
  v_count int;
begin
  -- Lock row (or create one) to avoid race conditions
  insert into public.chat_rate_limits (user_id, window_start, count, updated_at)
  values (p_user_id, v_now, 0, v_now)
  on conflict (user_id) do nothing;

  select window_start, count
    into v_window_start, v_count
  from public.chat_rate_limits
  where user_id = p_user_id
  for update;

  if v_window_start is null then
    v_window_start := v_now;
    v_count := 0;
  end if;

  -- Reset window if expired
  if extract(epoch from (v_now - v_window_start)) >= p_window_seconds then
    v_window_start := v_now;
    v_count := 0;
  end if;

  if v_count >= p_max_count then
    allowed := false;
    remaining := 0;
    reset_at := v_window_start + make_interval(secs => p_window_seconds);
    return next;
    return;
  end if;

  -- increment
  v_count := v_count + 1;
  update public.chat_rate_limits
     set window_start = v_window_start,
         count = v_count,
         updated_at = v_now
   where user_id = p_user_id;

  allowed := true;
  remaining := greatest(0, p_max_count - v_count);
  reset_at := v_window_start + make_interval(secs => p_window_seconds);
  return next;
end;
$$;

revoke all on function public.check_and_increment_chat_rate_limit(uuid, int, int) from public;
