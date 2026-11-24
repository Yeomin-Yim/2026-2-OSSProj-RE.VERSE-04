-- 거캠 회고록 가져오기
--   imports : 업로드 한 건의 진행 상태. OCR 결과(units)와 초안(draft)을 저장해 두고, 끊겨도 이어서 처리한다.
--   records.source_key : 노트가 거캠의 어느 칸에서 왔는지 ("gcam:2026-09-22:pm:0").
--                        새 PDF를 다시 올려도 같은 칸은 새 기록을 만들지 않고, 거캠 쪽 본문이 바뀐 경우에만 새 버전을 만든다.
--                        학생이 앱에서 고친 노트는 다시 가져와도 그대로 둔다.

create table public.imports (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references auth.users on delete cascade,
  file_name  text not null,
  file_path  text not null,                          -- Storage records 버킷: {owner}/imports/{id}.pdf
  status     text not null default 'reading'
               check (status in ('reading','ready','saving','saved')),
  page_count int,                                    -- 첫 처리 때 채운다
  pages_done int not null default 0,                 -- OCR을 마친 쪽 수 (앞에서부터)
  units      jsonb not null default '[]',            -- OCR 단위. 다 읽은 뒤 U번호가 붙는다
  draft      jsonb,                                  -- 프로젝트·노트 초안 (lib/server/gcam-import/draft.ts 의 Draft)
  usage      jsonb not null default '[]',            -- OpenAI 호출별 사용량
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.imports (owner_id);
create trigger imports_updated before update on public.imports
  for each row execute function public.set_updated_at();

alter table public.imports enable row level security;
revoke all on public.imports from anon;
grant select, insert, update, delete on public.imports to authenticated;
grant all on public.imports to service_role;
create policy own on public.imports for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- source_hash: 가져오기가 마지막으로 쓴 본문의 해시. 지금 본문과 다르면 학생이 고친 것이므로 다시 가져와도 건드리지 않는다
alter table public.records add column source_key text, add column source_hash text;
create unique index records_source_key on public.records (owner_id, source_key) where source_key is not null;

-- 회고록 PDF는 20MB를 넘기도 한다 (샘플 최대 22MB)
update storage.buckets set file_size_limit = 31457280 where id = 'records';   -- 30MB
