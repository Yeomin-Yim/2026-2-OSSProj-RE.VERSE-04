-- 0008 에서 만든 키워드 표에 표 권한(GRANT)을 준다.
-- 0002_rls.sql 은 표마다 권한을 직접 주는 방식이라, 새 표는 권한이 없다
-- ("permission denied for table keyword_aliases" 오류의 원인).
--   학생(authenticated) : keywords, keyword_aliases 는 읽기만 (쓰기는 kw_* 함수로만), keyword_runs 는 자기 것만 읽고 쓰기 (RLS 정책 own)
--   서버(service_role)  : 전체 권한 (점수표 만드는 스크립트)
--   비로그인(anon)      : 접근 불가

revoke all on public.keywords, public.keyword_aliases, public.keyword_runs from anon;
grant select on public.keywords, public.keyword_aliases to authenticated;
grant select, insert, update, delete on public.keyword_runs to authenticated;
grant all on public.keywords, public.keyword_aliases, public.keyword_runs to service_role;
grant usage, select on all sequences in schema public to service_role;
