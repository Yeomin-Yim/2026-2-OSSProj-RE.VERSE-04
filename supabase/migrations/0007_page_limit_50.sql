-- 파일 업로드 쪽수 제한 20 → 50. 학생 발표자료·보고서가 20쪽을 넘는 경우가 많다 (팀 문서 23·29·39쪽)
alter table public.record_versions drop constraint record_versions_page_count_check;
alter table public.record_versions add constraint record_versions_page_count_check
  check (page_count is null or page_count <= 50);
