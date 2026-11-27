-- 0012 공공기관 채용공고를 DB 에 쌓는다 (판단기록 D32)
--   Supabase 가 스스로 3시간마다 공공데이터포털(잡알리오)에서 진행 중 공고를 받아 public_postings 에 넣는다.
--   앱은 이 표만 읽는다 → 서버가 다시 떠도 다시 받지 않고, API 가 잠깐 죽어도 화면은 그대로.
--   필요: 확장 pg_cron, pg_net (Dashboard → Database → Extensions 에서 켬), Vault 에 키 저장 (아래 맨 끝 안내)
--   흐름: postings_request() 가 요청만 보낸다(pg_net 은 비동기) → postings_collect() 가 5분마다 도착한 응답을 표에 반영

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- 공고 원본 (API 한 건 그대로 data 에). 사라진 공고도 지우지 않고 seen_at 으로 구분한다
create table if not exists public.public_postings (
  sn          bigint primary key,
  data        jsonb not null,
  files       jsonb,
  seen_at     timestamptz not null default now(),
  files_at    timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists public_postings_seen on public.public_postings (seen_at desc);

-- 보낸 요청 목록 (pg_net 요청 번호 ↔ 무엇을 받았는지)
create table if not exists public.posting_requests (
  id          bigserial primary key,
  kind        text not null check (kind in ('list', 'detail')),
  request_id  bigint not null,
  sn          bigint,
  created_at  timestamptz not null default now(),
  done_at     timestamptz,
  ok          boolean
);

alter table public.public_postings enable row level security;
alter table public.posting_requests enable row level security;
drop policy if exists read_all on public.public_postings;
create policy read_all on public.public_postings for select to authenticated using (true);
revoke all on public.public_postings, public.posting_requests from anon, authenticated;
grant select on public.public_postings to authenticated;
grant all on public.public_postings, public.posting_requests to service_role;

-- 1) 요청 보내기: 진행 중 목록 1번 + 첨부가 아직 없는 최근 공고 상세 최대 80건 (개발계정 하루 1,000회 안쪽)
create or replace function public.postings_request()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  k text;
  base constant text := 'https://apis.data.go.kr/1051000/recruitment';
  r record;
begin
  select decrypted_secret into k from vault.decrypted_secrets where name = 'data_go_kr_key' limit 1;
  if k is null then
    raise notice 'Vault 에 data_go_kr_key 가 없어요';
    return;
  end if;
  k := replace(replace(replace(k, '+', '%2B'), '/', '%2F'), '=', '%3D');

  insert into public.posting_requests (kind, request_id)
  values ('list', net.http_get(
    url := base || '/list?serviceKey=' || k || '&resultType=json&ongoingYn=Y&numOfRows=1000&pageNo=1',
    timeout_milliseconds := 60000));

  for r in
    select sn from public.public_postings
    where files is null and seen_at > now() - interval '1 day'
      and sn not in (select sn from public.posting_requests where kind = 'detail' and created_at > now() - interval '1 day')
    order by sn desc
    limit 80
  loop
    insert into public.posting_requests (kind, request_id, sn)
    values ('detail', net.http_get(
      url := base || '/detail?serviceKey=' || k || '&resultType=json&sn=' || r.sn,
      timeout_milliseconds := 30000), r.sn);
  end loop;
end;
$$;

-- 2) 도착한 응답 반영: 목록은 공고 upsert, 상세는 첨부만
create or replace function public.postings_collect()
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  q record;
  body jsonb;
  n integer := 0;
begin
  for q in
    select p.id, p.kind, p.sn, h.status_code, h.content
    from public.posting_requests p
    join net._http_response h on h.id = p.request_id
    where p.done_at is null
  loop
    begin
      body := case when q.status_code = 200 then q.content::jsonb end;
      if body is not null and (body->>'resultCode') = '200' then
        if q.kind = 'list' then
          insert into public.public_postings (sn, data, seen_at)
          select (e->>'recrutPblntSn')::bigint, e, now()
          from jsonb_array_elements(body->'result') e
          where e ? 'recrutPblntSn'
          on conflict (sn) do update set data = excluded.data, seen_at = excluded.seen_at;
        else
          update public.public_postings
          set files = coalesce(body->'result'->'files', '[]'::jsonb), files_at = now()
          where sn = q.sn;
        end if;
        update public.posting_requests set done_at = now(), ok = true where id = q.id;
        n := n + 1;
      else
        update public.posting_requests set done_at = now(), ok = false where id = q.id;
      end if;
    exception when others then
      update public.posting_requests set done_at = now(), ok = false where id = q.id;
    end;
  end loop;

  -- 응답이 끝내 안 온 요청 정리, 오래된 요청 기록 지우기 (공고 자체는 남긴다)
  update public.posting_requests set done_at = now(), ok = false
  where done_at is null and created_at < now() - interval '1 hour';
  delete from public.posting_requests where created_at < now() - interval '7 days';
  return n;
end;
$$;

revoke all on function public.postings_request() from public, anon, authenticated;
revoke all on function public.postings_collect() from public, anon, authenticated;

-- 3) 일정: 3시간마다 요청(정각을 피해 7분), 5분마다 반영 (할 일이 없으면 바로 끝난다)
select cron.unschedule(jobid) from cron.job where jobname in ('postings_request', 'postings_collect');
select cron.schedule('postings_request', '7 */3 * * *', 'select public.postings_request()');
select cron.schedule('postings_collect', '*/5 * * * *', 'select public.postings_collect()');

-- ▶ 실행 뒤 한 번만 (키는 SQL 편집기에서 직접 넣고, 채팅·코드에는 남기지 않는다):
--   select vault.create_secret('<공공데이터포털 일반 인증키(Decoding)>', 'data_go_kr_key');
--   select public.postings_request();   -- 바로 첫 수집 (1~2분 뒤 표에 들어온다)
