-- Bastion Barons: ranking da Ranqueada (Supabase / Postgres)
-- Cole tudo no Supabase em: SQL Editor -> New query -> Run. Pode rodar de novo sem problema.

-- 1) Tabela: uma linha por conta
create table if not exists public.ranked_players (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  name        text not null check (char_length(name) between 2 and 20),
  baron       text not null default 'rei_bastion' check (baron in ('rei_bastion','elara','thorg','malachar','eldrin')),
  season      text not null check (season ~ '^[0-9]{4}-[0-9]{2}$'),
  points      integer not null default 0 check (points between 0 and 100000),
  max_league  smallint not null default 0 check (max_league between 0 and 5),
  streak      integer not null default 0 check (streak >= 0),
  wins        integer not null default 0 check (wins >= 0),
  losses      integer not null default 0 check (losses >= 0),
  draws       integer not null default 0 check (draws >= 0),
  trophies    integer not null default 0 check (trophies >= 0),
  prev_season text check (prev_season is null or prev_season = '' or prev_season ~ '^[0-9]{4}-[0-9]{2}$'),
  prev_points integer not null default 0 check (prev_points >= 0),
  updated_at  timestamptz not null default now()
);
create index if not exists ranked_players_season_points on public.ranked_players (season, points desc);
create index if not exists ranked_players_prev on public.ranked_players (prev_season);

-- 2) Segurança: todos podem LER; cada um só GRAVA a própria linha (sem apagar pela tabela)
alter table public.ranked_players enable row level security;
drop policy if exists "ranking: todos leem" on public.ranked_players;
drop policy if exists "ranking: cria a propria linha" on public.ranked_players;
drop policy if exists "ranking: altera a propria linha" on public.ranked_players;
create policy "ranking: todos leem" on public.ranked_players for select to anon, authenticated using (true);
create policy "ranking: cria a propria linha" on public.ranked_players for insert to authenticated with check (auth.uid() = user_id);
create policy "ranking: altera a propria linha" on public.ranked_players for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 3) Proteção contra trapaça (roda no banco, o jogo não consegue pular)
create or replace function public.ranked_guard() returns trigger
language plpgsql as $$
declare
  elapsed double precision;
  allowed integer;
begin
  if tg_op = 'INSERT' then
    -- linha nova começa com no máximo 40 pontos
    if new.points > 40 then raise exception 'ranked: linha nova com no maximo 40 pontos'; end if;
    if new.trophies > 1 then raise exception 'ranked: trofeus invalidos'; end if;
    if new.prev_points > 80 then raise exception 'ranked: pontos anteriores invalidos'; end if;
    new.updated_at := now();
    return new;
  end if;

  -- UPDATE
  if new.user_id <> old.user_id then raise exception 'ranked: conta nao pode mudar'; end if;
  elapsed := extract(epoch from (now() - old.updated_at));

  if new.season = old.season then
    -- mesma temporada: no máximo +40 a cada 40 s desde a última gravação, nada de subir em menos de 20 s
    if new.points > old.points then
      if elapsed < 20 then raise exception 'ranked: gravacao rapida demais'; end if;
      allowed := 40 * greatest(1, floor(elapsed / 40)::integer);
      if new.points - old.points > allowed then raise exception 'ranked: pontos demais para o tempo passado'; end if;
    end if;
    if new.trophies <> old.trophies then raise exception 'ranked: trofeu so muda na virada'; end if;
    if new.prev_points <> old.prev_points or coalesce(new.prev_season, '') <> coalesce(old.prev_season, '') then
      raise exception 'ranked: temporada anterior nao pode mudar';
    end if;
  else
    -- virada: só para frente, no máximo metade dos pontos antigos + 40, troféu sobe no máximo 1
    if new.season < old.season then raise exception 'ranked: temporada invalida'; end if;
    if new.points > floor(old.points / 2.0) + 40 then raise exception 'ranked: pontos demais na virada'; end if;
    if new.trophies > old.trophies + 1 or new.trophies < old.trophies then raise exception 'ranked: trofeus invalidos'; end if;
    if new.prev_points > old.points then raise exception 'ranked: pontos anteriores invalidos'; end if;
  end if;

  new.updated_at := now();
  return new;
end $$;

drop trigger if exists ranked_guard on public.ranked_players;
create trigger ranked_guard before insert or update on public.ranked_players
  for each row execute function public.ranked_guard();

-- 4) Apagar a própria conta (exigência da Google Play para apps com login)
create or replace function public.delete_my_account() returns void
language sql security definer set search_path = public as $$
  delete from auth.users where id = auth.uid();
$$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
