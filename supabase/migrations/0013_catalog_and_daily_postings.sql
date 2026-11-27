-- 0013 (판단기록 D33·D34)
--   A. 커리어넷 학과·직업 전체(약 1,050개)를 임베딩과 함께 저장 → 학생 기록과 의미로 비교해 추천 후보를 넓게 찾는다
--   B. 공공기관 공고 수집을 3시간 → 하루 1번으로 (공고 등록일이 날짜 단위라 자주 받아도 새 정보가 거의 없다)

-- ───────── A. 학과·직업 카탈로그 ─────────
create table if not exists public.career_catalog (
  kind            text not null check (kind in ('major', 'job')),
  code            text not null,                 -- 커리어넷 seq (major_profiles / job_profiles 의 code 와 같다)
  name            text not null,
  summary         text not null default '',
  body            text not null default '',      -- 원문 (개요·특성·적성·활동·교과목 / 하는 일·적성·흥미)
  url             text,
  extra           jsonb not null default '{}',   -- 계열·임금 수준·관련 직업 등
  source_updated  text,                          -- 커리어넷 수정일 (바뀌면 다시 받는다)
  fetched_at      date not null default current_date,
  body_hash       text,                          -- 원문이 바뀌었을 때만 임베딩을 다시 계산
  embedding       real[],
  embed_model     text,
  embedded_at     timestamptz,
  primary key (kind, code)
);

alter table public.career_catalog enable row level security;
drop policy if exists read_all on public.career_catalog;
create policy read_all on public.career_catalog for select to authenticated using (true);
revoke all on public.career_catalog from anon, authenticated;
grant select on public.career_catalog to authenticated;
grant all on public.career_catalog to service_role;

-- 내 기록 벡터 q 와 가장 닮은 학과·직업 n 개 (임베딩은 길이 1 이라 내적 = 코사인).
-- 1,050개 × 512차원을 앱으로 내려받지 않고(약 5MB) DB 안에서 계산해 후보만 돌려준다
create or replace function public.catalog_nearest(q real[], k text, n integer default 40)
returns table (code text, name text, summary text, url text, similarity real, embedding real[])
language sql
stable
set search_path = public
as $$
  select c.code, c.name, c.summary, c.url,
         (select sum(a * b) from unnest(c.embedding, q) as t(a, b))::real as similarity,
         c.embedding
  from public.career_catalog c
  where c.kind = k and c.embedding is not null
  order by similarity desc
  limit least(greatest(n, 1), 100);
$$;
revoke all on function public.catalog_nearest(real[], text, integer) from public, anon;
grant execute on function public.catalog_nearest(real[], text, integer) to authenticated, service_role;

-- ───────── B. 공고: 하루 1번 (한국 시간 06:07), 첨부 상세는 100건씩 세 번 나눠 (개발계정 하루 1,000회, 순간 요청 몰림 방지) ─────────
drop function if exists public.postings_request();
create or replace function public.postings_request(with_list boolean default true, detail_limit integer default 100)
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

  if with_list then
    insert into public.posting_requests (kind, request_id)
    values ('list', net.http_get(
      url := base || '/list?serviceKey=' || k || '&resultType=json&ongoingYn=Y&numOfRows=1000&pageNo=1',
      timeout_milliseconds := 60000));
  end if;

  for r in
    select sn from public.public_postings
    where files is null and seen_at > now() - interval '2 days'
      and sn not in (select sn from public.posting_requests where kind = 'detail' and sn is not null and created_at > now() - interval '20 hours')
    order by sn desc
    limit greatest(0, least(detail_limit, 300))
  loop
    insert into public.posting_requests (kind, request_id, sn)
    values ('detail', net.http_get(
      url := base || '/detail?serviceKey=' || k || '&resultType=json&sn=' || r.sn,
      timeout_milliseconds := 30000), r.sn);
  end loop;
end;
$$;
revoke all on function public.postings_request(boolean, integer) from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname in ('postings_request', 'postings_collect', 'postings_details_1', 'postings_details_2');
-- UTC 21시 = 한국 06시. 목록+첨부100 → 10분 뒤 첨부100 → 20분 뒤 첨부100, 반영은 그 시간대에만 5분마다
select cron.schedule('postings_request',   '7 21 * * *',  'select public.postings_request(true, 100)');
select cron.schedule('postings_details_1', '17 21 * * *', 'select public.postings_request(false, 100)');
select cron.schedule('postings_details_2', '27 21 * * *', 'select public.postings_request(false, 100)');
select cron.schedule('postings_collect',   '*/5 21 * * *', 'select public.postings_collect()');

-- ▶ (선택) 첨부를 지금 바로 채우려면 아래를 1분 간격으로 몇 번 실행한 뒤, 마지막에 collect 한 번:
--   select public.postings_request(false, 100);
--   select public.postings_collect();
