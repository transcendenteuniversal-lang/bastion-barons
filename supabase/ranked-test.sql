-- Teste local das regras do banco (Postgres sem Supabase: cria um auth falso).
-- Uso, na pasta do projeto:  psql -f supabase/ranked-test.sql   (cria e usa o banco bbtest)
\set ON_ERROR_STOP off
drop database if exists bbtest; create database bbtest;
\c bbtest
create schema auth;
create table auth.users (id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
do $$ begin create role anon; exception when others then null; end $$;
do $$ begin create role authenticated; exception when others then null; end $$;
grant usage on schema public, auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
\i supabase/ranked.sql
grant select on public.ranked_players to anon, authenticated;
grant insert, update on public.ranked_players to authenticated;
insert into auth.users values ('11111111-1111-1111-1111-111111111111'), ('22222222-2222-2222-2222-222222222222');
\echo '--- 1 INSERT com 60 pontos (deve falhar)'
set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into ranked_players (user_id,name,season,points) values ('11111111-1111-1111-1111-111111111111','Eu','2026-12',60);
\echo '--- 2 INSERT com 20 (ok)'
insert into ranked_players (user_id,name,season,points) values ('11111111-1111-1111-1111-111111111111','Eu','2026-12',20);
\echo '--- 3 gravar linha de outra pessoa (deve falhar)'
insert into ranked_players (user_id,name,season,points) values ('22222222-2222-2222-2222-222222222222','Outro','2026-12',0);
\echo '--- 4 UPDATE logo em seguida, +20 em menos de 20 s (deve falhar)'
update ranked_players set points = 40 where user_id = '11111111-1111-1111-1111-111111111111';
reset role;
alter table ranked_players disable trigger ranked_guard; update ranked_players set updated_at = now() - interval '45 seconds'; alter table ranked_players enable trigger ranked_guard;
set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
\echo '--- 5 UPDATE +35 depois de 45 s (ok)'
update ranked_players set points = 55 where user_id = '11111111-1111-1111-1111-111111111111' returning points;
reset role; alter table ranked_players disable trigger ranked_guard; update ranked_players set updated_at = now() - interval '45 seconds'; alter table ranked_players enable trigger ranked_guard;
set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
\echo '--- 6 UPDATE +100 depois de 45 s (deve falhar)'
update ranked_players set points = 155 where user_id = '11111111-1111-1111-1111-111111111111';
reset role; alter table ranked_players disable trigger ranked_guard; update ranked_players set updated_at = now() - interval '10 minutes'; alter table ranked_players enable trigger ranked_guard;
set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
\echo '--- 7 UPDATE +150 depois de 10 min (vitórias acumuladas, ok)'
update ranked_players set points = 205 where user_id = '11111111-1111-1111-1111-111111111111' returning points;
\echo '--- 8 UPSERT (insert on conflict) com 205+: o banco recusa (por isso o jogo usa INSERT/UPDATE)'
insert into ranked_players (user_id,name,season,points) values ('11111111-1111-1111-1111-111111111111','Eu','2026-12',230) on conflict (user_id) do update set points = excluded.points;
\echo '--- 9 virada com pontos demais (deve falhar)'
update ranked_players set season='2027-01', points=200, prev_season='2026-12', prev_points=205 where user_id = '11111111-1111-1111-1111-111111111111';
\echo '--- 10 virada correta: metade (102), troféu +1 (ok)'
update ranked_players set season='2027-01', points=102, prev_season='2026-12', prev_points=205, trophies=1 where user_id = '11111111-1111-1111-1111-111111111111' returning season, points, trophies;
\echo '--- 11 anônimo lê o ranking (ok)'
set role anon; set request.jwt.claim.sub = '';
select name, points from ranked_players;
\echo '--- 12 anônimo tenta gravar (deve falhar)'
update ranked_players set points = 9999;
select points from ranked_players;
