-- 권한과 행 수준 보안(RLS)
--   학생(authenticated) : 자기 데이터만 읽고 쓴다. 기준 데이터는 읽기만.
--   서버(service_role)  : 전체 권한. 수집 스크립트와 서버 코드에서만 쓴다.
--   비로그인(anon)      : 접근 불가.

grant usage on schema public to authenticated, service_role;

-- 1) 학생 소유 표: owner_id = 로그인 사용자
do $$
declare t text;
begin
  foreach t in array array['projects','records','record_versions','experiences','analysis_runs',
                           'graph_notes','note_projects','scraps','todos','portfolios']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format($p$create policy own on public.%I for all to authenticated
                      using (owner_id = (select auth.uid()))
                      with check (owner_id = (select auth.uid()))$p$, t);
  end loop;
end $$;

-- 2) 부모도 내 것이어야 한다 (남의 프로젝트 id에 내 기록을 붙이는 것을 막음)
--    부모 표에도 RLS가 걸려 있어, exists는 내 행만 본다.
create policy parent_own on public.records as restrictive for insert to authenticated
  with check (exists (select 1 from public.projects p where p.id = project_id));
create policy parent_own_upd on public.records as restrictive for update to authenticated
  with check (exists (select 1 from public.projects p where p.id = project_id));

create policy parent_own on public.record_versions as restrictive for insert to authenticated
  with check (exists (select 1 from public.records r where r.id = record_id));

create policy parent_own on public.experiences as restrictive for insert to authenticated
  with check (exists (select 1 from public.projects p where p.id = project_id)
              and (record_version_id is null
                   or exists (select 1 from public.record_versions v where v.id = record_version_id)));

create policy parent_own on public.note_projects as restrictive for insert to authenticated
  with check (exists (select 1 from public.graph_notes n where n.id = note_id)
              and exists (select 1 from public.projects p where p.id = project_id));

-- 3) profiles: 본인 행만. 생성은 가입 트리거가 한다.
alter table public.profiles enable row level security;
revoke all on public.profiles from anon;
grant select, update on public.profiles to authenticated;
create policy own_select on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy own_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- 4) 기준 데이터: 로그인 사용자는 읽기만. 쓰기는 service_role(수집 스크립트)만.
do $$
declare t text;
begin
  foreach t in array array['tag_dictionary','major_profiles','job_profiles','universities']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('create policy read_all on public.%I for select to authenticated using (true)', t);
  end loop;
end $$;

-- 5) 서버 전용 역할
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
