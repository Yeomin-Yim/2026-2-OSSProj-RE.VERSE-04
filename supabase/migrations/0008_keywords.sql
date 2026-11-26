-- 키워드 사전 (규칙 사전·태그를 대신하는 자체 키워드 체계). 설계: Src/lib/server/keywords/README.md
--   keywords        : 대표 키워드 + 임베딩. 모든 학생이 같이 쓴다 (읽기만 공개)
--   keyword_aliases : 처리 이력. 표현 → 판정(키워드/불용어) + 표현의 임베딩 캐시
--   keyword_runs    : 실행 기록 (AI 로 보낸 비율·토큰). 학생 본인만
-- 사전과 처리 이력은 학생이 직접 쓰지 못하고, 아래 함수(security definer)로만 고친다.
-- 임베딩은 real[] 로 저장한다 (pgvector 없이 동작. 사전이 수만 개로 커지면 vector 형 + 인덱스로 옮긴다).

create table public.keywords (
  id            bigint generated always as identity primary key,
  canonical     text not null check (char_length(canonical) between 1 and 30),
  category      text not null check (category in ('topic','activity','tech','output')),
  embedding     real[] not null,
  status        text not null default 'candidate' check (status in ('candidate','active')),
  origin        text not null default 'student' check (origin in ('student','profile','team')),
  project_count integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index keywords_canonical_key on public.keywords (lower(canonical));

create table public.keyword_aliases (
  surface      text primary key check (char_length(surface) between 1 and 40),
  decision     text check (decision in ('keyword','stop')),      -- null = 임베딩만 저장 (아직 판정 없음)
  keyword_id   bigint references public.keywords on delete set null,
  context_free boolean not null default true,                    -- false 면 판정을 다시 쓰지 않는다 ("모델" 등)
  decided_by   text check (decided_by in ('ai','team')),
  embedding    real[],
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.keyword_runs (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null default auth.uid() references auth.users on delete cascade,
  project_id       uuid references public.projects on delete cascade,
  fingerprint      text not null,          -- 프로젝트 문장 해시 묶음. 같으면 다시 돌리지 않는다
  pipeline_version text not null,
  params           jsonb not null default '{}',
  stats            jsonb not null default '{}',   -- {candidates, self_known, self_dropped, ai_sent, ai_existing, ai_new, ai_dropped, ...}
  model            text,
  input_tokens     integer,
  output_tokens    integer,
  problems         text[] not null default '{}',
  created_at       timestamptz not null default now()
);
create index keyword_runs_project on public.keyword_runs (project_id, created_at desc);

alter table public.keywords enable row level security;
alter table public.keyword_aliases enable row level security;
alter table public.keyword_runs enable row level security;
create policy read_all on public.keywords for select to authenticated using (true);
create policy read_all on public.keyword_aliases for select to authenticated using (true);
create policy own on public.keyword_runs for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

-- 처음 본 표현의 임베딩 저장 (판정은 건드리지 않는다)
create or replace function public.kw_cache_embeddings(p_items jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if jsonb_array_length(p_items) > 300 then raise exception 'too many items'; end if;
  insert into keyword_aliases (surface, embedding)
  select left(i->>'surface', 40), array(select jsonb_array_elements_text(i->'embedding')::real)
  from jsonb_array_elements(p_items) i
  where char_length(i->>'surface') between 1 and 40
    and jsonb_array_length(i->'embedding') between 64 and 3072
  on conflict (surface) do update set embedding = coalesce(keyword_aliases.embedding, excluded.embedding);
end $$;

-- 새 키워드와 처리 이력 저장. 대표 이름 → id 를 돌려준다
--   p_keywords: [{canonical, category, embedding, origin}]
--   p_aliases : [{surface, decision, canonical, context_free}]
create or replace function public.kw_learn(p_keywords jsonb, p_aliases jsonb)
returns table (canonical text, id bigint) language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
begin
  if jsonb_array_length(p_keywords) > 100 or jsonb_array_length(p_aliases) > 300 then raise exception 'too many items'; end if;

  insert into keywords (canonical, category, embedding, origin, status)
  select k->>'canonical', k->>'category', array(select jsonb_array_elements_text(k->'embedding')::real),
         coalesce(k->>'origin', 'student'),
         case when k->>'origin' = 'profile' then 'active' else 'candidate' end
  from jsonb_array_elements(p_keywords) k
  where char_length(k->>'canonical') between 1 and 30
    and jsonb_array_length(k->'embedding') between 64 and 3072
  on conflict do nothing;

  insert into keyword_aliases (surface, decision, keyword_id, context_free, decided_by, updated_at)
  select left(a->>'surface', 40), a->>'decision',
         (select w.id from keywords w where lower(w.canonical) = lower(a->>'canonical')),
         coalesce((a->>'context_free')::boolean, true), 'ai', now()
  from jsonb_array_elements(p_aliases) a
  where char_length(a->>'surface') between 1 and 40 and a->>'decision' in ('keyword','stop')
  on conflict (surface) do update set
    decision = excluded.decision, keyword_id = excluded.keyword_id, context_free = excluded.context_free,
    decided_by = excluded.decided_by, updated_at = now()
  where keyword_aliases.decided_by is distinct from 'team';   -- 팀이 직접 정한 판정은 AI 가 덮어쓰지 않는다

  return query
    select w.canonical, w.id from keywords w
    where lower(w.canonical) in (select lower(k->>'canonical') from jsonb_array_elements(p_keywords) k);
end $$;

-- 프로젝트에 처음 붙은 키워드의 사용 수를 올린다. 두 프로젝트 이상에서 나온 학생 키워드는 정식(active)
create or replace function public.kw_touch(p_ids bigint[])
returns void language sql security definer set search_path = public as $$
  update keywords set project_count = project_count + 1,
                      status = case when project_count + 1 >= 2 then 'active' else status end,
                      updated_at = now()
  where id = any(p_ids[1:200]);
$$;

revoke all on function public.kw_cache_embeddings(jsonb) from public, anon;
revoke all on function public.kw_learn(jsonb, jsonb) from public, anon;
revoke all on function public.kw_touch(bigint[]) from public, anon;
grant execute on function public.kw_cache_embeddings(jsonb) to authenticated, service_role;
grant execute on function public.kw_learn(jsonb, jsonb) to authenticated, service_role;
grant execute on function public.kw_touch(bigint[]) to authenticated, service_role;
