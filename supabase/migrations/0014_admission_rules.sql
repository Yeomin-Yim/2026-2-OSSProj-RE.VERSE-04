-- 0014 대학별 "거캠 학생이 지원할 수 있는가" (판단기록 D37)
--   거꾸로캠퍼스는 미인가 대안학교 → 학생은 보통 고졸 검정고시로 대학에 지원한다.
--   수능(정시)은 고졸 학력이면 어느 대학이나 지원 가능하지만, 수시 학생부종합은 대학·전형마다
--   "검정고시 출신 지원 가능 여부"와 "학교생활기록부 대체서식(필수/선택)"이 다르다. 대안학교 전형을 따로 두는 대학도 있다(예: 한동대).
--   대학 모집요강 원문(PDF)에서 전형별로 뽑아 출처 쪽수·확인일과 함께 저장한다 (scripts/fetch_admissions.ts).

create table if not exists public.admission_rules (
  university      text not null,               -- "동국대학교" (캠퍼스는 campus)
  campus          text not null default '',
  year            integer not null,            -- 학년도 (2027)
  track           text not null,               -- 전형명 그대로 ("Do Dream", "학교장추천인재" …)
  track_type      text not null check (track_type in ('종합', '교과', '실기', '논술', '기타')),
  ged_ok          boolean,                     -- 검정고시 출신 지원 가능 (null = 원문에 분명하지 않음)
  alt_form        text check (alt_form in ('필수', '선택', '없음')),  -- 학교생활기록부 대체서식
  alt_school      boolean not null default false,  -- 대안학교 출신 대상 전형
  note            text not null default '',    -- 조건 요약 (예: "졸업연도 제한 없음", "국내고 재학 사실 있으면 학생부 Ⅱ 필수")
  source_url      text not null,
  source_page     text,                        -- 근거 쪽 ("p.12, 67")
  checked_at      date not null default current_date,
  extracted_by    text not null default 'ai' check (extracted_by in ('ai', 'team')),
  primary key (university, campus, year, track)
);
create index if not exists admission_rules_univ on public.admission_rules (university, year);

-- 대학 단위 요약 (화면 배지용): 대안학교 전형 > 검정고시로 학종 가능 > 확인했지만 학종은 불가(정시는 가능) 
create or replace view public.admission_summary
with (security_invoker = true) as
select university, year,
       bool_or(alt_school) as alt_school,
       bool_or(track_type = '종합' and ged_ok) as ged_jonghap,
       bool_or(track_type = '종합' and ged_ok and alt_form = '필수') as form_required,
       count(*) filter (where ged_ok) as ged_tracks,
       min(source_url) as source_url,
       max(checked_at) as checked_at
from public.admission_rules
group by university, year;

alter table public.admission_rules enable row level security;
drop policy if exists read_all on public.admission_rules;
create policy read_all on public.admission_rules for select to authenticated using (true);
revoke all on public.admission_rules from anon, authenticated;
grant select on public.admission_rules to authenticated;
grant select on public.admission_summary to authenticated;
grant all on public.admission_rules to service_role;
grant select on public.admission_summary to service_role;
