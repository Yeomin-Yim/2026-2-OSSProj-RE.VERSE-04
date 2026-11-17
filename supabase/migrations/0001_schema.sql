-- RE:Cord DB 스키마 · 표 15개
-- 기준: 중간발표 p38. 표 설명과 JSON 필드 모양은 supabase/README.md 참고.

-- ───────── 공통 ─────────
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ───────── 사용자 ─────────
create table public.profiles (
  id         uuid primary key references auth.users on delete cascade,
  name       text not null default '',
  school     text,
  ui_state   jsonb not null default '{}',          -- 그래프 마지막 위치 등
  created_at timestamptz not null default now()
);

-- 회원가입 시 profiles 행 자동 생성
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', ''));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────── 기록 흐름: projects → records → record_versions → experiences ─────────
create table public.projects (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users on delete cascade,
  title       text not null,
  short_title text,
  topic       text,                                 -- 주제 · 팀 구성
  start_date  date,
  end_date    date,
  status      text not null default 'active' check (status in ('active','done')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index on public.projects (owner_id);
create trigger projects_updated before update on public.projects
  for each row execute function public.set_updated_at();

create table public.records (
  id              uuid primary key default gen_random_uuid(),
  no              bigint generated always as identity unique,  -- 문장 ID의 N 번호 (N11·V1·S2)
  owner_id        uuid not null default auth.uid() references auth.users on delete cascade,
  project_id      uuid not null references public.projects on delete cascade,
  kind            text not null check (kind in
                    ('meeting','reflection','document','photo','slides','result','link','memo')),
  title           text not null,
  recorded_at     date not null default current_date,  -- 기록이 작성된 날
  is_result       boolean not null default false,      -- 결과물 표시 (kind와 별개)
  url             text,                                -- kind=link
  answer_key      text check (answer_key in ('role','problem','process','result','reflection')),
                                                       -- 보완 질문 답변이면 어느 항목인지
  current_version int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index on public.records (project_id);
create index on public.records (owner_id);
create trigger records_updated before update on public.records
  for each row execute function public.set_updated_at();

create table public.record_versions (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null default auth.uid() references auth.users on delete cascade,
  record_id      uuid not null references public.records on delete cascade,
  version        int  not null,
  body_hash      text not null,                    -- 본문이 같으면 새 버전을 만들지 않는다
  raw_text       text,                             -- 직접 쓴 본문 · 파일 설명
  extracted_text text,                             -- 파일에서 추출한 글
  file_path      text,                             -- Storage: {owner}/{record}/{version}/{파일명}
  file_mime      text,
  page_count     int check (page_count is null or page_count <= 20),
  sentences      jsonb not null default '[]',      -- [{sid,n,text,page,hash,entry_date?}]
  created_at     timestamptz not null default now(),
  unique (record_id, version),
  check (char_length(coalesce(raw_text,'')) <= 20000),
  check (char_length(coalesce(extracted_text,'')) <= 20000)
);
create index on public.record_versions (owner_id);

-- 태그·개요. 한 행 = (기록 버전 × 출처) 또는 (프로젝트 개요 × 출처)
--   record_version_id 있음 → 그 버전의 태그 (source: rule | ai | student)
--   record_version_id 없음 → 프로젝트 개요 6항목 (source: ai | student), input_refs = 입력으로 쓴 버전
create table public.experiences (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null default auth.uid() references auth.users on delete cascade,
  project_id        uuid not null references public.projects on delete cascade,
  record_version_id uuid references public.record_versions on delete cascade,
  tags              jsonb not null default '[]',   -- [{code,sid,matched,removed?}]
  fields            jsonb not null default '{}',   -- {role:{text,sids},activity,problem,process,result,reflection}
  input_refs        uuid[] not null default '{}',
  source            text not null check (source in ('rule','ai','student')),
  rule_version      text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create unique index experiences_version_source on public.experiences (record_version_id, source)
  where record_version_id is not null;
create unique index experiences_overview_source on public.experiences (project_id, source)
  where record_version_id is null;
create index on public.experiences (project_id);
create index on public.experiences (owner_id);
create trigger experiences_updated before update on public.experiences
  for each row execute function public.set_updated_at();

-- ───────── 계산 결과 (계산 영수증) ─────────
create table public.analysis_runs (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null default auth.uid() references auth.users on delete cascade,
  purpose         text not null check (purpose in ('graph','college','career')),
  input_refs      uuid[] not null default '{}',    -- 계산에 쓴 record_versions.id
  rule_version    text,
  profile_version text,
  threshold       numeric,                         -- graph: 연결선 기준 (시험값 0.18)
  relations       jsonb not null default '[]',     -- [{a,b,score,shared,evidence}]
  recommendations jsonb not null default '[]',     -- [{profile_id,score,breadth,depth,depth_project_id,cells,explanation?}]
  created_at      timestamptz not null default now()
);
create index on public.analysis_runs (owner_id, purpose, created_at desc);

-- ───────── 기준 데이터 (팀이 관리, 학생은 읽기만) ─────────
create table public.tag_dictionary (
  version    text primary key,                     -- 'v0.4'
  dict       jsonb not null,                       -- Doc/design/RE-Cord_규칙사전_*.json 그대로
  active     boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index tag_dictionary_one_active on public.tag_dictionary (active) where active;

create table public.major_profiles (
  id              uuid primary key default gen_random_uuid(),
  code            text not null,                   -- 커리어넷 majorSeq
  name            text not null,
  weights         jsonb not null default '{}',     -- {태그코드: 1~3}
  source          jsonb not null default '{}',     -- 원본 응답 · 맞은 구절
  source_url      text,
  fetched_at      date,
  rule_version    text,
  profile_version text not null,
  unique (code, profile_version)
);

create table public.job_profiles (
  id              uuid primary key default gen_random_uuid(),
  code            text not null,                   -- 커리어넷 직업 코드
  name            text not null,
  weights         jsonb not null default '{}',
  source          jsonb not null default '{}',
  source_url      text,
  fetched_at      date,
  rule_version    text,
  profile_version text not null,
  unique (code, profile_version)
);

create table public.universities (
  id         uuid primary key default gen_random_uuid(),
  major_code text not null,                        -- major_profiles.code
  name       text not null,
  campus     text,
  area       text,
  url        text,
  fetched_at date
);
create index on public.universities (major_code);

-- ───────── 학생 기능 ─────────
create table public.graph_notes (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references auth.users on delete cascade,
  title      text not null,
  body       text not null default '',
  pos        jsonb,                                -- 그래프에서 끌어 옮긴 위치
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.graph_notes (owner_id);
create trigger graph_notes_updated before update on public.graph_notes
  for each row execute function public.set_updated_at();

create table public.note_projects (
  note_id    uuid not null references public.graph_notes on delete cascade,
  project_id uuid not null references public.projects on delete cascade,
  owner_id   uuid not null default auth.uid() references auth.users on delete cascade,
  primary key (note_id, project_id)
);
create index on public.note_projects (project_id);

create table public.scraps (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references auth.users on delete cascade,
  type       text not null check (type in ('major','job','university','note','project')),
  ref_id     text not null,
  title      text not null,
  meta       jsonb not null default '{}',
  memo       text not null default '',
  loc        jsonb,                                -- {mode,path,sel} 원래 위치
  created_at timestamptz not null default now(),
  unique (owner_id, type, ref_id)
);

create table public.todos (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references auth.users on delete cascade,
  key        text not null,                        -- 'school:{id}' | 'job:{id}'
  text       text not null,
  done       boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.todos (owner_id, key);

create table public.portfolios (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users on delete cascade,
  template_id text not null,
  title       text not null,
  project_ids uuid[] not null default '{}',        -- 순서 포함
  profile     jsonb not null default '{}',
  draft       jsonb not null default '{}',         -- AI 초안 {project_id:{problem:{text,sids},…}}
  content     jsonb not null default '{}',         -- 학생 수정본
  alt         jsonb not null default '{}',         -- 대체서식 표
  prompts     jsonb not null default '{}',
  built_at    timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index on public.portfolios (owner_id);
create trigger portfolios_updated before update on public.portfolios
  for each row execute function public.set_updated_at();
