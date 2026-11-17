-- 김서윤 가상 사례 시드 (프로젝트 5개 · 기록 25개). 모두 가상 데이터.
-- 프로토타입 HTML의 샘플 기록을 실제 저장 흐름과 같은 계산(Src/core)으로 처리해 만든 파일이다.
-- 사용법: ① Authentication → Users 에서 seoyun@record.test 사용자를 만든다  ② 이 파일을 SQL Editor 에서 실행
do $seed$
declare uid uuid;
begin
  select id into uid from auth.users where email = 'seoyun@record.test';
  if uid is null then raise exception '먼저 Authentication → Users 에서 seoyun@record.test 사용자를 만드세요'; end if;
  if exists (select 1 from public.projects where owner_id = uid) then raise exception '이 사용자에게 이미 프로젝트가 있습니다. 시드를 다시 넣으려면 프로젝트를 먼저 지우세요'; end if;
  if exists (select 1 from public.records where no between 1 and 25) then raise exception '기록 번호 1~25가 이미 쓰이고 있습니다. 시드는 빈 DB에 먼저 넣으세요'; end if;

  update public.profiles set name = '김서윤' where id = uid;
  insert into public.projects (id, owner_id, title, short_title, topic, start_date, end_date, status) values
    ('aaf98e4c-1b05-579b-acbf-aac5cea58c5e', uid, '우리 동네 다회용컵 순환 프로젝트', '다회용컵 순환', '일회용 컵 줄이기 서비스 기획', '2024-03-04', '2024-06-28', 'done');
  insert into public.records (id, no, owner_id, project_id, kind, title, recorded_at, is_result, url, current_version)
    overriding system value values
    ('32022af8-cb37-5356-ad0c-cf9a46f164c1', 1, uid, 'aaf98e4c-1b05-579b-acbf-aac5cea58c5e', 'meeting', '3차 회의록 · 설문 및 인터뷰 설계 검토', '2024-03-22', false, null, 1);
  insert into public.record_versions (id, owner_id, record_id, version, body_hash, raw_text, sentences) values
    ('dc976c51-e69b-5938-ae57-3350be667628', uid, '32022af8-cb37-5356-ad0c-cf9a46f164c1', 1, '91fe55db4e0dbd40', '내가 설문 문항 초안을 발제했다. 단순한 찬반 문항을 빼고 "반대하는 구체적 이유"를 묻는 객관식·서술형 혼합 15문항으로 정리했고, 팀원 피드백을 받아 문항을 확정했다. 다회용컵을 꺼리는 이유(위생 불안, 반납의 번거로움)를 찾는 게 계기였다.', $j$[{"sid":"N1·V1·S1","n":1,"text":"내가 설문 문항 초안을 발제했다.","hash":"db46d788bead8af6"},{"sid":"N1·V1·S2","n":2,"text":"단순한 찬반 문항을 빼고 \"반대하는 구체적 이유\"를 묻는 객관식·서술형 혼합 15문항으로 정리했고, 팀원 피드백을 받아 문항을 확정했다.","hash":"0052ce9cbbdc1ee6"},{"sid":"N1·V1·S3","n":3,"text":"다회용컵을 꺼리는 이유(위생 불안, 반납의 번거로움)를 찾는 게 계기였다.","hash":"8afda885d05a3405"}]$j$::jsonb);
  insert into public.experiences (owner_id, project_id, record_version_id, tags, source, rule_version) values
    (uid, 'aaf98e4c-1b05-579b-acbf-aac5cea58c5e', 'dc976c51-e69b-5938-ae57-3350be667628', $j$[{"code":"M04","matched":"설문","sid":"N1·V1·S1"},{"code":"M04","matched":"문항","sid":"N1·V1·S2"},{"code":"M22","matched":"피드백을 받","sid":"N1·V1·S2"},{"code":"D03","matched":"다회용","sid":"N1·V1·S3"}]$j$::jsonb, 'rule', 'v0.5');
  insert into public.records (id, no, owner_id, project_id, kind, title, recorded_at, is_result, url, current_version)
    overriding system value values
    ('32aa4fdd-ce61-5289-a3d4-6b4e87470a55', 2, uid, 'aaf98e4c-1b05-579b-acbf-aac5cea58c5e', 'document', '카페 3곳 점주 인터뷰 녹취 요약.pdf', '2024-04-15', false, null, 1);
  insert into public.record_versions (id, owner_id, record_id, version, body_hash, raw_text, sentences) values
    ('587c2d56-0618-558c-aa30-91fdd2971813', uid, '32aa4fdd-ce61-5289-a3d4-6b4e87470a55', 1, 'e0b9374dce48e1aa', '동네 개인 카페 A·B·C 점주 인터뷰 요약. "세척에 드는 인건비와 공간 부족"이 가장 큰 걸림돌이라는 공통 의견. 6차 회의에서 기획 방향을 공동 수거 모델로 바꾸자고 제안했다.', $j$[{"sid":"N2·V1·S1","n":1,"text":"동네 개인 카페 A·B·C 점주 인터뷰 요약.","hash":"a8d8ff307154c86f"},{"sid":"N2·V1·S2","n":2,"text":"\"세척에 드는 인건비와 공간 부족\"이 가장 큰 걸림돌이라는 공통 의견.","hash":"8e7b65561afb17e2"},{"sid":"N2·V1·S3","n":3,"text":"6차 회의에서 기획 방향을 공동 수거 모델로 바꾸자고 제안했다.","hash":"e0e0e85739e96bb8"}]$j$::jsonb);
  insert into public.experiences (owner_id, project_id, record_version_id, tags, source, rule_version) values
    (uid, 'aaf98e4c-1b05-579b-acbf-aac5cea58c5e', '587c2d56-0618-558c-aa30-91fdd2971813', $j$[{"code":"D02","matched":"동네","sid":"N2·V1·S1"},{"code":"M03","matched":"인터뷰","sid":"N2·V1·S1"}]$j$::jsonb, 'rule', 'v0.5');
  insert into public.records (id, no, owner_id, project_id, kind, title, recorded_at, is_result, url, current_version)
    overriding system value values
    ('77712229-3972-5fca-a167-485122f7007a', 3, uid, 'aaf98e4c-1b05-579b-acbf-aac5cea58c5e', 'document', '소비자 설문 응답 120건 정리.xlsx', '2024-05-03', false, null, 1);
  insert into public.record_versions (id, owner_id, record_id, version, body_hash, raw_text, sentences) values
    ('39f991d6-7dc8-5502-ae6c-fb955c13f4d4', uid, '77712229-3972-5fca-a167-485122f7007a', 1, '2361fefe86910230', '학생·주민 120명 설문 응답을 엑셀로 정리하고 교차 분석했다. 보증금 환불 편의성이 참여율에 미치는 영향을 수치로 확인한 조사 자료.', $j$[{"sid":"N3·V1·S1","n":1,"text":"학생·주민 120명 설문 응답을 엑셀로 정리하고 교차 분석했다.","hash":"abc8bccaeb09fb58"},{"sid":"N3·V1·S2","n":2,"text":"보증금 환불 편의성이 참여율에 미치는 영향을 수치로 확인한 조사 자료.","hash":"564012e9d984b12f"}]$j$::jsonb);
  insert into public.experiences (owner_id, project_id, record_version_id, tags, source, rule_version) values
    (uid, 'aaf98e4c-1b05-579b-acbf-aac5cea58c5e', '39f991d6-7dc8-5502-ae6c-fb955c13f4d4', $j$[{"code":"D02","matched":"주민","sid":"N3·V1·S1"},{"code":"M04","matched":"설문","sid":"N3·V1·S1"},{"code":"M06","matched":"교차 분석","sid":"N3·V1·S1"},{"code":"T04","matched":"엑셀","sid":"N3·V1·S1"}]$j$::jsonb, 'rule', 'v0.5');
  insert into public.records (id, no, owner_id, project_id, kind, title, recorded_at, is_result, url, current_version)
    overriding system value values
    ('818c8421-e749-509e-af55-d49beed3c75f', 4, uid, 'aaf98e4c-1b05-579b-acbf-aac5cea58c5e', 'photo', '사용자 여정 지도 화이트보드.jpg', '2024-05-20', true, null, 1);
  insert into public.record_versions (id, owner_id, record_id, version, body_hash, raw_text, sentences) values
    ('1a202d0c-e7f8-5186-ad18-becb6f9028e6', uid, '818c8421-e749-509e-af55-d49beed3c75f', 1, 'e3b0c44298fc1c14', '', $j$[]$j$::jsonb);
  insert into public.experiences (owner_id, project_id, record_version_id, tags, source, rule_version) values
    (uid, 'aaf98e4c-1b05-579b-acbf-aac5cea58c5e', '1a202d0c-e7f8-5186-ad18-becb6f9028e6', $j$[]$j$::jsonb, 'rule', 'v0.5');
  insert into public.records (id, no, owner_id, project_id, kind, title, recorded_at, is_result, url, current_version)
    overriding system value values
    ('18e43fdc-a335-544e-a219-6210d30d53f9', 5, uid, 'aaf98e4c-1b05-579b-acbf-aac5cea58c5e', 'reflection', '회고 · 결과와 한계', '2024-06-28', false, null, 1);
  insert into public.record_versions (id, owner_id, record_id, version, body_hash, raw_text, sentences) values
    ('f43c456d-c540-56db-a7fd-4a113614451f', uid, '18e43fdc-a335-544e-a219-6210d30d53f9', 1, '822f48cfab7555cb', '거점형 공동 수거·세척 서비스 기획안을 완성한 건 결과로 남지만, 카페 실제 도입까지는 못 간 게 아쉽다. 세척·운송 운영 비용의 재무 검토가 부족했다는 걸 배웠다. 다음엔 실현 가능성(비용)을 반드시 정량화해야 한다.', $j$[{"sid":"N5·V1·S1","n":1,"text":"거점형 공동 수거·세척 서비스 기획안을 완성한 건 결과로 남지만, 카페 실제 도입까지는 못 간 게 아쉽다.","hash":"ea39d8921cdc1511"},{"sid":"N5·V1·S2","n":2,"text":"세척·운송 운영 비용의 재무 검토가 부족했다는 걸 배웠다.","hash":"a30879af71ec7872"},{"sid":"N5·V1·S3","n":3,"text":"다음엔 실현 가능성(비용)을 반드시 정량화해야 한다.","hash":"69487a8228e003af"}]$j$::jsonb);
  insert into public.experiences (owner_id, project_id, record_version_id, tags, source, rule_version) values
    (uid, 'aaf98e4c-1b05-579b-acbf-aac5cea58c5e', 'f43c456d-c540-56db-a7fd-4a113614451f', $j$[{"code":"M12","matched":"서비스 기획","sid":"N5·V1·S1"},{"code":"O02","matched":"기획안","sid":"N5·V1·S1"}]$j$::jsonb, 'rule', 'v0.5');
  insert into public.experiences (owner_id, project_id, fields, source) values
    (uid, 'aaf98e4c-1b05-579b-acbf-aac5cea58c5e', $j${"role":{"text":"설문 설계 · 사용자 조사 · 데이터 정리 · 서비스 기획","sids":[]},"activity":{"text":"설문·인터뷰 / 서비스 기획","sids":[]},"problem":{"text":"학교 주변과 동네 상권에서 쓰이는 일회용 컵을 줄일 실질적인 방법이 필요했습니다.","sids":[]},"process":{"text":"소비자 설문 15문항과 점주 인터뷰 10문항을 설계해 카페 3곳을 방문했고, 120명 응답을 교차 분석했습니다.","sids":[]},"result":{"text":"거점형 공동 수거·세척 서비스 기획안과 사용자 여정 지도를 완성했습니다.","sids":[]},"reflection":{"text":"실현 가능성(비용)을 정량화하지 못한 한계를 확인했습니다.","sids":[]}}$j$::jsonb, 'student');
  insert into public.projects (id, owner_id, title, short_title, topic, start_date, end_date, status) values
    ('594a5db9-9b19-51a3-ad1d-eac96992090d', uid, '청소년 야간 귀가 안전지도', '야간 귀가 안전지도', '체감형 안전지도 · 앱 화면 설계', '2024-09-02', '2024-12-20', 'done');
  insert into public.records (id, no, owner_id, project_id, kind, title, recorded_at, is_result, url, current_version)
    overriding system value values
    ('8f79ae40-fc84-5926-a9c2-6c1227c4dc42', 6, uid, '594a5db9-9b19-51a3-ad1d-eac96992090d', 'meeting', '2차 회의록 · 현장조사 구역 분할 및 기준 수립', '2024-09-25', false, null, 1);
  insert into public.record_versions (id, owner_id, record_id, version, body_hash, raw_text, sentences) values
    ('deaae5cb-771f-5be8-a9b0-a71902999d7c', uid, '8f79ae40-fc84-5926-a9c2-6c1227c4dc42', 1, '3efbac3fae0d2e0a', '주관적 느낌이 아닌 객관적 관찰을 위해 "가로등 간격 50m 이상", "CCTV 미설치 구간" 같은 데이터 수집 기준 가이드라인을 내가 작성해 팀원에게 배포했다. 야간 귀가 때 느끼는 불안이 문제의 출발점이었다.', $j$[{"sid":"N6·V1·S1","n":1,"text":"주관적 느낌이 아닌 객관적 관찰을 위해 \"가로등 간격 50m 이상\", \"CCTV 미설치 구간\" 같은 데이터 수집 기준 가이드라인을 내가 작성해 팀원에게 배포했다.","hash":"a1ce7be73eacb2cb"},{"sid":"N6·V1·S2","n":2,"text":"야간 귀가 때 느끼는 불안이 문제의 출발점이었다.","hash":"90670f9451f89945"}]$j$::jsonb);
  insert into public.experiences (owner_id, project_id, record_version_id, tags, source, rule_version) values
    (uid, '594a5db9-9b19-51a3-ad1d-eac96992090d', 'deaae5cb-771f-5be8-a9b0-a71902999d7c', $j$[{"code":"D05","matched":"가로등","sid":"N6·V1·S1"},{"code":"M14","matched":"가이드라인","sid":"N6·V1·S1"},{"code":"D05","matched":"야간 귀가","sid":"N6·V1·S2"}]$j$::jsonb, 'rule', 'v0.5');
  insert into public.records (id, no, owner_id, project_id, kind, title, recorded_at, is_result, url, current_version)
    overriding system value values
    ('8961092b-92c6-52de-a735-cbf539ac8ca7', 7, uid, '594a5db9-9b19-51a3-ad1d-eac96992090d', 'document', '위험·안전 요소 45건 좌표 시트.xlsx', '2024-10-18', false, null, 1);
  insert into public.record_versions (id, owner_id, record_id, version, body_hash, raw_text, sentences) values
    ('eea00a7d-9b08-5557-af14-d0056bd7995c', uid, '8961092b-92c6-52de-a735-cbf539ac8ca7', 1, 'ace29fc00cb1caae', '밤 8~10시에 귀가 동선 3곳을 도보로 이동하며 조도를 측정하고 사각지대를 관찰했다. 위험/안전 요소 45건의 위도·경도를 구글 맵스 핀으로 수집해 분류 기준에 따라 구조화한 조사 데이터. 팀원 좌표 120여 개의 중복·오류를 엑셀 함수로 정제했다.', $j$[{"sid":"N7·V1·S1","n":1,"text":"밤 8~10시에 귀가 동선 3곳을 도보로 이동하며 조도를 측정하고 사각지대를 관찰했다.","hash":"2d827550ef431124"},{"sid":"N7·V1·S2","n":2,"text":"위험/안전 요소 45건의 위도·경도를 구글 맵스 핀으로 수집해 분류 기준에 따라 구조화한 조사 데이터.","hash":"f56eed19380307fc"},{"sid":"N7·V1·S3","n":3,"text":"팀원 좌표 120여 개의 중복·오류를 엑셀 함수로 정제했다.","hash":"36b6d42e7d5177eb"}]$j$::jsonb);
  insert into public.experiences (owner_id, project_id, record_version_id, tags, source, rule_version) values
    (uid, '594a5db9-9b19-51a3-ad1d-eac96992090d', 'eea00a7d-9b08-5557-af14-d0056bd7995c', $j$[{"code":"M05","matched":"측정","sid":"N7·V1·S1"},{"code":"M09","matched":"좌표","sid":"N7·V1·S3"},{"code":"T04","matched":"엑셀","sid":"N7·V1·S3"}]$j$::jsonb, 'rule', 'v0.5');
  insert into public.records (id, no, owner_id, project_id, kind, title, recorded_at, is_result, url, current_version)
    overriding system value values
    ('e228ea69-6d50-54a9-a56b-29c3576fe2e7', 8, uid, '594a5db9-9b19-51a3-ad1d-eac96992090d', 'link', 'My Maps 1차 시각화', '2024-11-02', false, 'https://example.com/my-maps-safety', 1);
  insert into public.record_versions (id, owner_id, record_id, version, body_hash, raw_text, sentences) values
    ('e99b6bd8-0643-5033-a320-162cb241552f', uid, 'e228ea69-6d50-54a9-a56b-29c3576fe2e7', 1, '8b547306cc61827d', '수집한 위치 데이터를 My Maps로 시각화하고 위험도에 따라 색상 코드를 부여한 범례를 만들었다.', $j$[{"sid":"N8·V1·S1","n":1,"text":"수집한 위치 데이터를 My Maps로 시각화하고 위험도에 따라 색상 코드를 부여한 범례를 만들었다.","hash":"8b547306cc61827d"}]$j$::jsonb);
  insert into public.experiences (owner_id, project_id, record_version_id, tags, source, rule_version) values
    (uid, '594a5db9-9b19-51a3-ad1d-eac96992090d', 'e99b6bd8-0643-5033-a320-162cb241552f', $j$[{"code":"M07","matched":"시각화","sid":"N8·V1·S1"},{"code":"M09","matched":"위치 데이터","sid":"N8·V1·S1"}]$j$::jsonb, 'rule', 'v0.5');
  insert into public.records (id, no, owner_id, project_id, kind, title, recorded_at, is_result, url, current_version)
    overriding system value values
    ('066233d0-0c8e-5ad9-a3fa-d82f8738e9e4', 9, uid, '594a5db9-9b19-51a3-ad1d-eac96992090d', 'document', 'Figma 모바일 앱 와이어프레임 8장.pdf', '2024-11-15', true, null, 1);
  insert into public.record_versions (id, owner_id, record_id, version, body_hash, raw_text, sentences) values
    ('10c1cc4a-2dc9-5f32-ace0-3eacf71035c5', uid, '066233d0-0c8e-5ad9-a3fa-d82f8738e9e4', 1, '52785bdd8d39a43e', 'Figma로 설계한 안전지도 조회·위험 요소 제보 앱 UI 와이어프레임 8장. 9차 회의에서 제보하기 버튼을 플로팅 액션 버튼으로 수정하자는 의견을 반영해 최종 시안을 완성했다.', $j$[{"sid":"N9·V1·S1","n":1,"text":"Figma로 설계한 안전지도 조회·위험 요소 제보 앱 UI 와이어프레임 8장.","hash":"b530e4b08b657155"},{"sid":"N9·V1·S2","n":2,"text":"9차 회의에서 제보하기 버튼을 플로팅 액션 버튼으로 수정하자는 의견을 반영해 최종 시안을 완성했다.","hash":"552078ff5613ef80"}]$j$::jsonb);
  insert into public.experiences (owner_id, project_id, record_version_id, tags, source, rule_version) values
    (uid, '594a5db9-9b19-51a3-ad1d-eac96992090d', '10c1cc4a-2dc9-5f32-ace0-3eacf71035c5', $j$[{"code":"D05","matched":"안전지도","sid":"N9·V1·S1"},{"code":"M10","matched":"안전지도","sid":"N9·V1·S1"},{"code":"M13","matched":"ui","sid":"N9·V1·S1"},{"code":"O03","matched":"와이어프레임","sid":"N9·V1·S1"},{"code":"O04","matched":"안전지도","sid":"N9·V1·S1"},{"code":"T06","matched":"figma","sid":"N9·V1·S1"},{"code":"O03","matched":"시안","sid":"N9·V1·S2"}]$j$::jsonb, 'rule', 'v0.5');
  insert into public.records (id, no, owner_id, project_id, kind, title, recorded_at, is_result, url, current_version)
    overriding system value values
    ('59006dc6-09e4-5f3c-a293-9634bfe8724f', 10, uid, '594a5db9-9b19-51a3-ad1d-eac96992090d', 'reflection', '회고 · 결과와 한계', '2024-12-20', false, null, 1);
  insert into public.record_versions (id, owner_id, record_id, version, body_hash, raw_text, sentences) values
    ('57a53a6f-1d03-55f8-ae04-18f01e0b2ce8', uid, '59006dc6-09e4-5f3c-a293-9634bfe8724f', 1, '1b8ead10800f514e', '직접 발로 뛰어 모은 데이터로 지역 맞춤형 안전지도 프로토타입 시안을 완성해 성취감이 컸다. 다만 CCTV나 가로등 같은 시설의 수만으로 실제 안전함을 단정하기엔 논리적 비약이 있다는 걸 배웠다. 다음엔 거주민 체감 안전도 설문과 교차 분석이 필요하다.', $j$[{"sid":"N10·V1·S1","n":1,"text":"직접 발로 뛰어 모은 데이터로 지역 맞춤형 안전지도 프로토타입 시안을 완성해 성취감이 컸다.","hash":"0796d9f657a47157"},{"sid":"N10·V1·S2","n":2,"text":"다만 CCTV나 가로등 같은 시설의 수만으로 실제 안전함을 단정하기엔 논리적 비약이 있다는 걸 배웠다.","hash":"dce481168dba8fc1"},{"sid":"N10·V1·S3","n":3,"text":"다음엔 거주민 체감 안전도 설문과 교차 분석이 필요하다.","hash":"3445b8fbd9896d42"}]$j$::jsonb);
  insert into public.experiences (owner_id, project_id, record_version_id, tags, source, rule_version) values
    (uid, '594a5db9-9b19-51a3-ad1d-eac96992090d', '57a53a6f-1d03-55f8-ae04-18f01e0b2ce8', $j$[{"code":"D05","matched":"안전지도","sid":"N10·V1·S1"},{"code":"M10","matched":"안전지도","sid":"N10·V1·S1"},{"code":"O03","matched":"시안","sid":"N10·V1·S1"},{"code":"O04","matched":"안전지도","sid":"N10·V1·S1"},{"code":"O06","matched":"프로토타입","sid":"N10·V1·S1"},{"code":"D05","matched":"cctv","sid":"N10·V1·S2"},{"code":"D02","matched":"주민","sid":"N10·V1·S3"}]$j$::jsonb, 'rule', 'v0.5');
  insert into public.experiences (owner_id, project_id, fields, source) values
    (uid, '594a5db9-9b19-51a3-ad1d-eac96992090d', $j${"role":{"text":"현장조사 · 위치 데이터 정리 · 지도 시각화 · 서비스 화면 설계","sids":[]},"activity":{"text":"야간 현장조사 / 지도 시각화 / 앱 UI 설계","sids":[]},"problem":{"text":"야간 자율학습·학원 하원 후 귀가하는 청소년의 불안을 실제 생활 반경의 위험·안전 요소로 풀고 싶었습니다.","sids":[]},"process":{"text":"귀가 동선 3곳을 밤에 직접 걸으며 요소 45건의 좌표를 수집·구조화하고, My Maps로 시각화한 뒤 Figma로 앱 화면 8장을 설계했습니다.","sids":[]},"result":{"text":"지역 맞춤형 체감 안전지도 프로토타입과 제보 기능이 있는 앱 와이어프레임을 완성했습니다.","sids":[]},"reflection":{"text":"시설의 수만으로 안전을 단정할 수 없어 체감 안전도 설문과의 교차 분석이 필요함을 배웠습니다.","sids":[]}}$j$::jsonb, 'student');
  insert into public.projects (id, owner_id, title, short_title, topic, start_date, end_date, status) values
    ('467e9afb-fbfc-52e4-a5c9-ddd440e1d780', uid, '학교 급식 잔반 줄이기 데이터 프로젝트', '급식 잔반 데이터', 'Python 데이터 분석 · 식단 개선안', '2025-03-03', '2025-07-18', 'done');
  insert into public.records (id, no, owner_id, project_id, kind, title, recorded_at, is_result, url, current_version)
    overriding system value values
    ('eef558ec-53ae-5b43-aaaf-2d1b8a9c6614', 11, uid, '467e9afb-fbfc-52e4-a5c9-ddd440e1d780', 'meeting', '2차 회의록 · 수집 변수 확정', '2025-03-28', false, null, 1);
  insert into public.record_versions (id, owner_id, record_id, version, body_hash, raw_text, sentences) values
    ('bcd17380-1c50-5608-a2d6-0f5d0d98c7f2', uid, 'eef558ec-53ae-5b43-aaaf-2d1b8a9c6614', 1, 'bfc967110db4e278', '감성적 캠페인이 아니라 데이터로 급식 잔반 문제에 접근하자는 게 계기였다. 배식 인원 변동을 통제하기 위해 "1인당 평균 잔반량" 파생 변수를 만들자고 내가 제안해 분석의 타당성을 높였다.', $j$[{"sid":"N11·V1·S1","n":1,"text":"감성적 캠페인이 아니라 데이터로 급식 잔반 문제에 접근하자는 게 계기였다.","hash":"3895ef19729399da"},{"sid":"N11·V1·S2","n":2,"text":"배식 인원 변동을 통제하기 위해 \"1인당 평균 잔반량\" 파생 변수를 만들자고 내가 제안해 분석의 타당성을 높였다.","hash":"89f42a67af9add89"}]$j$::jsonb);
  insert into public.experiences (owner_id, project_id, record_version_id, tags, source, rule_version) values
    (uid, '467e9afb-fbfc-52e4-a5c9-ddd440e1d780', 'bcd17380-1c50-5608-a2d6-0f5d0d98c7f2', $j$[{"code":"D03","matched":"잔반","sid":"N11·V1·S1"},{"code":"D17","matched":"급식","sid":"N11·V1·S1"},{"code":"M24","matched":"캠페인","sid":"N11·V1·S1"},{"code":"D03","matched":"잔반","sid":"N11·V1·S2"},{"code":"D17","matched":"잔반","sid":"N11·V1·S2"},{"code":"M06","matched":"평균 잔반량","sid":"N11·V1·S2"}]$j$::jsonb, 'rule', 'v0.5');
  insert into public.records (id, no, owner_id, project_id, kind, title, recorded_at, is_result, url, current_version)
    overriding system value values
    ('dc57c5f3-aff2-50b1-a86a-54397008cb19', 12, uid, '467e9afb-fbfc-52e4-a5c9-ddd440e1d780', 'document', '4주 잔반·식단·날씨 데이터.csv', '2025-04-30', false, null, 1);
  insert into public.record_versions (id, owner_id, record_id, version, body_hash, raw_text, sentences) values
    ('9f020529-9faf-5cf0-ae49-bccc014bc753', uid, 'dc57c5f3-aff2-50b1-a86a-54397008cb19', 1, 'a03b18ccdcc0633d', '영양교사 면담으로 확보한 20일치 일별 잔반 발생량 추정치, 식단표, 날씨 데이터. 결측치와 단위 불일치를 pandas로 정제한 조사 데이터셋.', $j$[{"sid":"N12·V1·S1","n":1,"text":"영양교사 면담으로 확보한 20일치 일별 잔반 발생량 추정치, 식단표, 날씨 데이터.","hash":"43a3a2999d51d1a9"},{"sid":"N12·V1·S2","n":2,"text":"결측치와 단위 불일치를 pandas로 정제한 조사 데이터셋.","hash":"21ea101ffff88435"}]$j$::jsonb);
  insert into public.experiences (owner_id, project_id, record_version_id, tags, source, rule_version) values
    (uid, '467e9afb-fbfc-52e4-a5c9-ddd440e1d780', '9f020529-9faf-5cf0-ae49-bccc014bc753', $j$[{"code":"D03","matched":"잔반","sid":"N12·V1·S1"},{"code":"D17","matched":"영양","sid":"N12·V1·S1"},{"code":"M03","matched":"면담","sid":"N12·V1·S1"},{"code":"D10","matched":"데이터셋","sid":"N12·V1·S2"},{"code":"M06","matched":"결측","sid":"N12·V1·S2"},{"code":"O05","matched":"데이터셋","sid":"N12·V1·S2"},{"code":"T02","matched":"pandas","sid":"N12·V1·S2"}]$j$::jsonb, 'rule', 'v0.5');
  insert into public.records (id, no, owner_id, project_id, kind, title, recorded_at, is_result, url, current_version)
    overriding system value values
    ('63749054-6a2b-5fd8-a274-222389d600c7', 13, uid, '467e9afb-fbfc-52e4-a5c9-ddd440e1d780', 'meeting', '6차 회의록 · Python 전처리 이슈 해결', '2025-05-10', false, null, 1);
  insert into public.record_versions (id, owner_id, record_id, version, body_hash, raw_text, sentences) values
    ('0e53b9c4-9170-5c87-ac7f-51d112f0563a', uid, '63749054-6a2b-5fd8-a274-222389d600c7', 1, 'daede58d9559c304', '텍스트 식단표를 카테고리화하는 자동화의 한계를 공유하고, 주요 반찬 50개를 수동 태깅해 pandas 매핑 딕셔너리를 구축했다. 내가 맡은 전처리 부분을 수정해 해결했다.', $j$[{"sid":"N13·V1·S1","n":1,"text":"텍스트 식단표를 카테고리화하는 자동화의 한계를 공유하고, 주요 반찬 50개를 수동 태깅해 pandas 매핑 딕셔너리를 구축했다.","hash":"fd23c761269c4d4c"},{"sid":"N13·V1·S2","n":2,"text":"내가 맡은 전처리 부분을 수정해 해결했다.","hash":"5f8c9270774ac39f"}]$j$::jsonb);
  insert into public.experiences (owner_id, project_id, record_version_id, tags, source, rule_version) values
    (uid, '467e9afb-fbfc-52e4-a5c9-ddd440e1d780', '0e53b9c4-9170-5c87-ac7f-51d112f0563a', $j$[{"code":"D17","matched":"식단","sid":"N13·V1·S1"},{"code":"M06","matched":"pandas","sid":"N13·V1·S1"},{"code":"M14","matched":"카테고리","sid":"N13·V1·S1"},{"code":"T02","matched":"pandas","sid":"N13·V1·S1"}]$j$::jsonb, 'rule', 'v0.5');
  insert into public.records (id, no, owner_id, project_id, kind, title, recorded_at, is_result, url, current_version)
    overriding system value values
    ('aea7572a-6fb3-5993-af12-a3c9b3cd52ed', 14, uid, '467e9afb-fbfc-52e4-a5c9-ddd440e1d780', 'photo', '요일별 잔반량 추이 차트.png', '2025-06-20', true, null, 1);
  insert into public.record_versions (id, owner_id, record_id, version, body_hash, raw_text, sentences) values
    ('5d2f60b6-f94e-55cf-abe7-5443b6ff9cd6', uid, 'aea7572a-6fb3-5993-af12-a3c9b3cd52ed', 1, 'e3b0c44298fc1c14', '', $j$[]$j$::jsonb);
  insert into public.experiences (owner_id, project_id, record_version_id, tags, source, rule_version) values
    (uid, '467e9afb-fbfc-52e4-a5c9-ddd440e1d780', '5d2f60b6-f94e-55cf-abe7-5443b6ff9cd6', $j$[]$j$::jsonb, 'rule', 'v0.5');
  insert into public.records (id, no, owner_id, project_id, kind, title, recorded_at, is_result, url, current_version)
    overriding system value values
    ('57483319-d56b-51b9-accd-f865651688d7', 15, uid, '467e9afb-fbfc-52e4-a5c9-ddd440e1d780', 'document', '영양교사 전달 분석 리포트.pdf', '2025-07-18', true, null, 1);
  insert into public.record_versions (id, owner_id, record_id, version, body_hash, raw_text, sentences) values
    ('4ad4ce67-b085-545a-ad0f-858b7e71622a', uid, '57483319-d56b-51b9-accd-f865651688d7', 1, '9e4f23957b8a1c4c', '"맑은 국이 나오는 날 잔반이 15% 증가한다"는 분석 결과와 비선호 메뉴 배식량 자율화 개선안을 담은 리포트 완성. 4주 추정치라 계절 요인을 반영하지 못해 일반화에 한계가 있다고 명시했다. 막연한 문제를 수치화하는 법을 배웠다.', $j$[{"sid":"N15·V1·S1","n":1,"text":"\"맑은 국이 나오는 날 잔반이 15% 증가한다\"는 분석 결과와 비선호 메뉴 배식량 자율화 개선안을 담은 리포트 완성.","hash":"ba3e348d909eb995"},{"sid":"N15·V1·S2","n":2,"text":"4주 추정치라 계절 요인을 반영하지 못해 일반화에 한계가 있다고 명시했다.","hash":"61ca6d788d908950"},{"sid":"N15·V1·S3","n":3,"text":"막연한 문제를 수치화하는 법을 배웠다.","hash":"2a4b6a7832a3cb91"}]$j$::jsonb);
  insert into public.experiences (owner_id, project_id, record_version_id, tags, source, rule_version) values
    (uid, '467e9afb-fbfc-52e4-a5c9-ddd440e1d780', '4ad4ce67-b085-545a-ad0f-858b7e71622a', $j$[{"code":"D03","matched":"잔반","sid":"N15·V1·S1"},{"code":"D17","matched":"잔반","sid":"N15·V1·S1"},{"code":"O01","matched":"리포트 완성","sid":"N15·V1·S1"},{"code":"O02","matched":"개선안","sid":"N15·V1·S1"}]$j$::jsonb, 'rule', 'v0.5');
  insert into public.experiences (owner_id, project_id, fields, source) values
    (uid, '467e9afb-fbfc-52e4-a5c9-ddd440e1d780', $j${"role":{"text":"데이터 수집 설계 · Python 분석 · 시각화 · 개선안 기획","sids":[]},"activity":{"text":"데이터 수집 / Python 분석 / 리포트","sids":[]},"problem":{"text":"매일 버려지는 급식 잔반을 캠페인이 아닌 데이터로 설명하고, 어떤 식단에서 잔반이 느는지 패턴을 찾고 싶었습니다.","sids":[]},"process":{"text":"영양교사와 수집 파이프라인을 설계해 4주치 데이터를 확보하고, pandas로 정제한 뒤 반찬 종류·조리 방식별 상관관계를 matplotlib·seaborn으로 시각화했습니다.","sids":[]},"result":{"text":"\"맑은 국이 나오는 날 잔반 15% 증가\" 등 인사이트와 배식량 자율화 개선안을 리포트로 영양교사에게 전달했습니다.","sids":[]},"reflection":{"text":"4주 추정치만으로는 계절 요인을 반영할 수 없어 통계적 일반화에 한계가 있음을 명시했습니다.","sids":[]}}$j$::jsonb, 'student');
  insert into public.projects (id, owner_id, title, short_title, topic, start_date, end_date, status) values
    ('51f4ea94-f0d8-596d-a60e-619b0e942917', uid, '청소년을 위한 지역 활동 탐색 서비스', '지역 활동 탐색', '정보 구조 설계 · 문장 임베딩 추천 실험', '2025-09-01', '2026-01-30', 'done');
  insert into public.records (id, no, owner_id, project_id, kind, title, recorded_at, is_result, url, current_version)
    overriding system value values
    ('4166cebb-65b8-5e15-aabd-1da45bcc9aba', 16, uid, '51f4ea94-f0d8-596d-a60e-619b0e942917', 'meeting', '4차 회의록 · 인터뷰 분석 및 페르소나 설정', '2025-10-12', false, null, 1);
  insert into public.record_versions (id, owner_id, record_id, version, body_hash, raw_text, sentences) values
    ('3b19548c-82c4-5c64-a5ad-28b89f31697e', uid, '4166cebb-65b8-5e15-aabd-1da45bcc9aba', 1, 'cbfcd4d9d52a6110', '지자체 동아리·봉사·진로 체험 정보가 여러 기관 사이트에 흩어져 접근하기 어렵다는 문제에서 출발했다. 학생 18명 심층 인터뷰 결과를 분석해 "진로 탐색이 시급한 고1"과 "봉사 시간이 필요한 중3" 두 페르소나를 정의하고 기능 우선순위를 제안했다.', $j$[{"sid":"N16·V1·S1","n":1,"text":"지자체 동아리·봉사·진로 체험 정보가 여러 기관 사이트에 흩어져 접근하기 어렵다는 문제에서 출발했다.","hash":"1018eb4eaccf0689"},{"sid":"N16·V1·S2","n":2,"text":"학생 18명 심층 인터뷰 결과를 분석해 \"진로 탐색이 시급한 고1\"과 \"봉사 시간이 필요한 중3\" 두 페르소나를 정의하고 기능 우선순위를 제안했다.","hash":"2c51272ff9f73021"}]$j$::jsonb);
  insert into public.experiences (owner_id, project_id, record_version_id, tags, source, rule_version) values
    (uid, '51f4ea94-f0d8-596d-a60e-619b0e942917', '3b19548c-82c4-5c64-a5ad-28b89f31697e', $j$[{"code":"D09","matched":"진로 탐색","sid":"N16·V1·S2"},{"code":"M03","matched":"인터뷰","sid":"N16·V1·S2"}]$j$::jsonb, 'rule', 'v0.5');
  insert into public.records (id, no, owner_id, project_id, kind, title, recorded_at, is_result, url, current_version)
    overriding system value values
    ('36def4f6-1df3-5c2a-a4c0-1af263002938', 17, uid, '51f4ea94-f0d8-596d-a60e-619b0e942917', 'document', '지역 프로그램 80개 메타데이터.xlsx', '2025-10-30', false, null, 1);
  insert into public.record_versions (id, owner_id, record_id, version, body_hash, raw_text, sentences) values
    ('cbc8aff0-3b5d-5612-a7a7-54d600acdfe8', uid, '36def4f6-1df3-5c2a-a4c0-1af263002938', 1, 'e3126ed5e991c9a6', '약 80개의 실제 지역 예시 프로그램을 수집해 활동유형·기간·지역·비용 메타데이터 구조를 설계한 조사 자료.', $j$[{"sid":"N17·V1·S1","n":1,"text":"약 80개의 실제 지역 예시 프로그램을 수집해 활동유형·기간·지역·비용 메타데이터 구조를 설계한 조사 자료.","hash":"e3126ed5e991c9a6"}]$j$::jsonb);
  insert into public.experiences (owner_id, project_id, record_version_id, tags, source, rule_version) values
    (uid, '51f4ea94-f0d8-596d-a60e-619b0e942917', 'cbc8aff0-3b5d-5612-a7a7-54d600acdfe8', $j$[{"code":"M16","matched":"데이터 구조","sid":"N17·V1·S1"}]$j$::jsonb, 'rule', 'v0.5');
  insert into public.records (id, no, owner_id, project_id, kind, title, recorded_at, is_result, url, current_version)
    overriding system value values
    ('d415628e-2aee-5cad-ae5b-8c5d169e2474', 18, uid, '51f4ea94-f0d8-596d-a60e-619b0e942917', 'meeting', '8차 회의록 · 검색 로직 한계 분석', '2025-11-20', false, null, 1);
  insert into public.record_versions (id, owner_id, record_id, version, body_hash, raw_text, sentences) values
    ('02107092-ab85-55a0-a802-041864f01add', uid, 'd415628e-2aee-5cad-ae5b-8c5d169e2474', 1, '318877f4728e638a', '"디자인을 배우고 싶어"라는 문장에 if문 기반 키워드 검색이 결과를 못 돌려주는 테스트 케이스를 시연하며 NLP 모델 도입의 필요성을 설득했다. 키워드 일치 검색의 한계를 발견한 게 전환점이었다.', $j$[{"sid":"N18·V1·S1","n":1,"text":"\"디자인을 배우고 싶어\"라는 문장에 if문 기반 키워드 검색이 결과를 못 돌려주는 테스트 케이스를 시연하며 NLP 모델 도입의 필요성을 설득했다.","hash":"cb642daf529bc617"},{"sid":"N18·V1·S2","n":2,"text":"키워드 일치 검색의 한계를 발견한 게 전환점이었다.","hash":"a3da461d102debd6"}]$j$::jsonb);
  insert into public.experiences (owner_id, project_id, record_version_id, tags, source, rule_version) values
    (uid, '51f4ea94-f0d8-596d-a60e-619b0e942917', '02107092-ab85-55a0-a802-041864f01add', $j$[{"code":"M22","matched":"테스트","sid":"N18·V1·S1"},{"code":"M23","matched":"시연","sid":"N18·V1·S1"}]$j$::jsonb, 'rule', 'v0.5');
  insert into public.records (id, no, owner_id, project_id, kind, title, recorded_at, is_result, url, current_version)
    overriding system value values
    ('e76d5c28-1fa9-53e4-acc7-deac59ac28fa', 19, uid, '51f4ea94-f0d8-596d-a60e-619b0e942917', 'link', 'Sentence-BERT 임베딩 실험 스크립트', '2025-12-15', true, 'https://example.com/embedding-test', 1);
  insert into public.record_versions (id, owner_id, record_id, version, body_hash, raw_text, sentences) values
    ('c7d735ba-9cf3-5ede-a12b-7f23901d4439', uid, 'e76d5c28-1fa9-53e4-acc7-deac59ac28fa', 1, '257acc9fde3f040a', '사전 학습된 문장 임베딩 모델(Sentence-BERT)로 관심사 문장과 프로그램 설명의 코사인 유사도를 계산해, 키워드 매칭보다 맥락에 맞는 추천이 나오는 것을 A/B 비교 보고서로 입증했다. 실험을 내가 주도했다.', $j$[{"sid":"N19·V1·S1","n":1,"text":"사전 학습된 문장 임베딩 모델(Sentence-BERT)로 관심사 문장과 프로그램 설명의 코사인 유사도를 계산해, 키워드 매칭보다 맥락에 맞는 추천이 나오는 것을 A/B 비교 보고서로 입증했다.","hash":"0a2ec643ce441122"},{"sid":"N19·V1·S2","n":2,"text":"실험을 내가 주도했다.","hash":"1b641eb2ed19c9ea"}]$j$::jsonb);
  insert into public.experiences (owner_id, project_id, record_version_id, tags, source, rule_version) values
    (uid, '51f4ea94-f0d8-596d-a60e-619b0e942917', 'c7d735ba-9cf3-5ede-a12b-7f23901d4439', $j$[{"code":"M18","matched":"임베딩","sid":"N19·V1·S1"},{"code":"T11","matched":"임베딩 모델","sid":"N19·V1·S1"},{"code":"M05","matched":"실험","sid":"N19·V1·S2"}]$j$::jsonb, 'rule', 'v0.5');
  insert into public.records (id, no, owner_id, project_id, kind, title, recorded_at, is_result, url, current_version)
    overriding system value values
    ('797b8715-220f-5f85-aa7f-3d48fae21e73', 20, uid, '51f4ea94-f0d8-596d-a60e-619b0e942917', 'reflection', '회고 · 결과와 한계', '2026-01-30', false, null, 1);
  insert into public.record_versions (id, owner_id, record_id, version, body_hash, raw_text, sentences) values
    ('1ef6b230-8fc0-5bba-a52d-03889ca01a85', uid, '797b8715-220f-5f85-aa7f-3d48fae21e73', 1, '77f12649c2ee690d', '파편화된 정보를 구조화하고 의미 기반 임베딩을 실제 문제에 실험해 본 점에서 기술적 호기심과 문제 해결력이 성장했다고 느낀다. 다만 기관 사이트가 바뀌면 정보가 자동 갱신되는 파이프라인까지는 구현하지 못한 한계를 배웠다.', $j$[{"sid":"N20·V1·S1","n":1,"text":"파편화된 정보를 구조화하고 의미 기반 임베딩을 실제 문제에 실험해 본 점에서 기술적 호기심과 문제 해결력이 성장했다고 느낀다.","hash":"8a612c0f5255ed79"},{"sid":"N20·V1·S2","n":2,"text":"다만 기관 사이트가 바뀌면 정보가 자동 갱신되는 파이프라인까지는 구현하지 못한 한계를 배웠다.","hash":"dda85448814f8afb"}]$j$::jsonb);
  insert into public.experiences (owner_id, project_id, record_version_id, tags, source, rule_version) values
    (uid, '51f4ea94-f0d8-596d-a60e-619b0e942917', '1ef6b230-8fc0-5bba-a52d-03889ca01a85', $j$[{"code":"M05","matched":"실험","sid":"N20·V1·S1"},{"code":"M18","matched":"임베딩","sid":"N20·V1·S1"}]$j$::jsonb, 'rule', 'v0.5');
  insert into public.experiences (owner_id, project_id, fields, source) values
    (uid, '51f4ea94-f0d8-596d-a60e-619b0e942917', $j${"role":{"text":"사용자 인터뷰 · 정보 구조 설계 · Python 구현 · 추천 알고리즘 실험","sids":[]},"activity":{"text":"인터뷰 / 정보 구조 설계 / 임베딩 실험","sids":[]},"problem":{"text":"청소년 활동 정보가 기관별 사이트에 흩어져 있어 접근성이 떨어졌고, 관심사에 맞는 프로그램을 찾기 어려웠습니다.","sids":[]},"process":{"text":"학생 18명을 인터뷰해 페르소나를 정의하고 프로그램 80개의 메타데이터 구조를 설계했으며, 키워드 검색의 한계를 확인한 뒤 Sentence-BERT 임베딩으로 유사도 추천을 실험했습니다.","sids":[]},"result":{"text":"의미 기반 검색이 키워드 검색보다 맥락에 맞는 결과를 내는 것을 A/B 비교 보고서로 입증했습니다.","sids":[]},"reflection":{"text":"정보 자동 갱신 파이프라인은 구현하지 못했다는 기술적 한계를 인식했습니다.","sids":[]}}$j$::jsonb, 'student');
  insert into public.projects (id, owner_id, title, short_title, topic, start_date, end_date, status) values
    ('3f28d2b0-fd5c-5ff1-a748-36c375f88c56', uid, '학생 경험을 연결하는 프로젝트 팀원 매칭 플랫폼', '팀원 매칭 플랫폼', '경험 데이터 모델링 · 역할 보완성 추천', '2026-03-02', '2026-09-25', 'done');
  insert into public.records (id, no, owner_id, project_id, kind, title, recorded_at, is_result, url, current_version)
    overriding system value values
    ('ab0068b2-8cf1-5ae0-a116-dd3a1c8fbeb2', 21, uid, '3f28d2b0-fd5c-5ff1-a748-36c375f88c56', 'meeting', '3차 회의록 · 경험 데이터 속성 정의', '2026-04-05', false, null, 1);
  insert into public.record_versions (id, owner_id, record_id, version, body_hash, raw_text, sentences) values
    ('9a4ba00d-e6d2-5c5f-ad4b-f4ccc39d31cb', uid, 'ab0068b2-8cf1-5ae0-a116-dd3a1c8fbeb2', 1, '6c7d8cea42b154c0', '팀 프로젝트에서 친분 위주로 팀을 꾸려 역할이 편중되는 문제를 풀고 싶었다. 브레인스토밍을 거쳐 프로젝트 경험을 [주제, 역할, 툴, 기간] 4가지 메타데이터로 압축하는 데이터 모델링 초안을 내가 발제했다.', $j$[{"sid":"N21·V1·S1","n":1,"text":"팀 프로젝트에서 친분 위주로 팀을 꾸려 역할이 편중되는 문제를 풀고 싶었다.","hash":"d56b48baab48ddb3"},{"sid":"N21·V1·S2","n":2,"text":"브레인스토밍을 거쳐 프로젝트 경험을 [주제, 역할, 툴, 기간] 4가지 메타데이터로 압축하는 데이터 모델링 초안을 내가 발제했다.","hash":"8ccba475ec835817"}]$j$::jsonb);
  insert into public.experiences (owner_id, project_id, record_version_id, tags, source, rule_version) values
    (uid, '3f28d2b0-fd5c-5ff1-a748-36c375f88c56', '9a4ba00d-e6d2-5c5f-ad4b-f4ccc39d31cb', $j$[{"code":"M16","matched":"데이터 모델링","sid":"N21·V1·S2"}]$j$::jsonb, 'rule', 'v0.5');
  insert into public.records (id, no, owner_id, project_id, kind, title, recorded_at, is_result, url, current_version)
    overriding system value values
    ('9e9af2c9-afb3-5fa5-afcc-a1308b169d77', 22, uid, '3f28d2b0-fd5c-5ff1-a748-36c375f88c56', 'document', '경험 데이터베이스 스키마 설계.pdf', '2026-05-12', false, null, 1);
  insert into public.record_versions (id, owner_id, record_id, version, body_hash, raw_text, sentences) values
    ('c072316a-1b14-561e-a28d-0470faf20c34', uid, '9e9af2c9-afb3-5fa5-afcc-a1308b169d77', 1, 'e3305bcd1b7769cc', '가상 학생 30명의 프로젝트 이력을 분석해 역할·사용 도구·성취 결과를 속성으로 갖는 경험 DB 스키마를 설계했다. 줄글 자기소개서를 수치와 카테고리로 매핑하는 경험의 구조화 작업을 맡았다.', $j$[{"sid":"N22·V1·S1","n":1,"text":"가상 학생 30명의 프로젝트 이력을 분석해 역할·사용 도구·성취 결과를 속성으로 갖는 경험 DB 스키마를 설계했다.","hash":"3eaa10141318b8c6"},{"sid":"N22·V1·S2","n":2,"text":"줄글 자기소개서를 수치와 카테고리로 매핑하는 경험의 구조화 작업을 맡았다.","hash":"c328a22843a84c28"}]$j$::jsonb);
  insert into public.experiences (owner_id, project_id, record_version_id, tags, source, rule_version) values
    (uid, '3f28d2b0-fd5c-5ff1-a748-36c375f88c56', 'c072316a-1b14-561e-a28d-0470faf20c34', $j$[{"code":"M16","matched":"스키마","sid":"N22·V1·S1"},{"code":"T09","matched":"db","sid":"N22·V1·S1"},{"code":"M14","matched":"카테고리","sid":"N22·V1·S2"}]$j$::jsonb, 'rule', 'v0.5');
  insert into public.records (id, no, owner_id, project_id, kind, title, recorded_at, is_result, url, current_version)
    overriding system value values
    ('329e3569-88e5-5554-a0e9-c2783be52b32', 23, uid, '3f28d2b0-fd5c-5ff1-a748-36c375f88c56', 'meeting', '9차 회의록 · 추천 가중치 공식 수립', '2026-06-10', false, null, 1);
  insert into public.record_versions (id, owner_id, record_id, version, body_hash, raw_text, sentences) values
    ('8d2dd56b-c6fe-52e1-a7c6-10ca967edd11', uid, '329e3569-88e5-5554-a0e9-c2783be52b32', 1, '804a69439495040f', '팀 구성 실패 사례를 조사·분석해 "관심사 유사도 40% + 필요 역할 충족도 60%"라는 추천 점수 공식을 정의하고 팀원 동의를 얻었다.', $j$[{"sid":"N23·V1·S1","n":1,"text":"팀 구성 실패 사례를 조사·분석해 \"관심사 유사도 40% + 필요 역할 충족도 60%\"라는 추천 점수 공식을 정의하고 팀원 동의를 얻었다.","hash":"804a69439495040f"}]$j$::jsonb);
  insert into public.experiences (owner_id, project_id, record_version_id, tags, source, rule_version) values
    (uid, '3f28d2b0-fd5c-5ff1-a748-36c375f88c56', '8d2dd56b-c6fe-52e1-a7c6-10ca967edd11', $j$[]$j$::jsonb, 'rule', 'v0.5');
  insert into public.records (id, no, owner_id, project_id, kind, title, recorded_at, is_result, url, current_version)
    overriding system value values
    ('157bf44c-9c0b-53a7-ac57-4a58625683eb', 24, uid, '3f28d2b0-fd5c-5ff1-a748-36c375f88c56', 'link', 'Python 매칭 프로토타입 (Top 3 추천 로직)', '2026-08-22', true, 'https://example.com/team-matching', 1);
  insert into public.record_versions (id, owner_id, record_id, version, body_hash, raw_text, sentences) values
    ('8a1facf0-1abf-5a37-aae8-c901312f4233', uid, '157bf44c-9c0b-53a7-ac57-4a58625683eb', 1, '562e37138c24cce0', '30명 더미 데이터로 특정 학생이 프로젝트를 개설하면 가장 적합한 팀원 Top 3를 반환하는 로직을 구현했다. 14차 회의에서 기획자 A에게 개발 역량이 높은 B가 1순위로 추천되는 정상 작동을 시연해 검증을 완성했다.', $j$[{"sid":"N24·V1·S1","n":1,"text":"30명 더미 데이터로 특정 학생이 프로젝트를 개설하면 가장 적합한 팀원 Top 3를 반환하는 로직을 구현했다.","hash":"aae01ea3ac8ef157"},{"sid":"N24·V1·S2","n":2,"text":"14차 회의에서 기획자 A에게 개발 역량이 높은 B가 1순위로 추천되는 정상 작동을 시연해 검증을 완성했다.","hash":"84b8991c3b97f75e"}]$j$::jsonb);
  insert into public.experiences (owner_id, project_id, record_version_id, tags, source, rule_version) values
    (uid, '3f28d2b0-fd5c-5ff1-a748-36c375f88c56', '8a1facf0-1abf-5a37-aae8-c901312f4233', $j$[{"code":"M17","matched":"구현","sid":"N24·V1·S1"},{"code":"M23","matched":"시연","sid":"N24·V1·S2"}]$j$::jsonb, 'rule', 'v0.5');
  insert into public.records (id, no, owner_id, project_id, kind, title, recorded_at, is_result, url, current_version)
    overriding system value values
    ('a2e077eb-7efe-5cee-aedd-82e7b6628b0e', 25, uid, '3f28d2b0-fd5c-5ff1-a748-36c375f88c56', 'reflection', '회고 · 결과와 한계', '2026-09-25', false, null, 1);
  insert into public.record_versions (id, owner_id, record_id, version, body_hash, raw_text, sentences) values
    ('759d93df-df44-5aa7-a271-5ec7460b842a', uid, 'a2e077eb-7efe-5cee-aedd-82e7b6628b0e', 1, 'd94576ed39c36796', '지역 활동 탐색에서 경험한 검색·추천 개념을 발전시켜 데이터 모델링부터 보완성 기준 알고리즘, 프로토타입까지 만든 성장을 느꼈다. 다만 가상 학생 30명 시뮬레이션이라 실제 팀워크 향상에 기여했는지 객관적 검증은 못 했다는 걸 배웠고 다음 과제로 남겼다.', $j$[{"sid":"N25·V1·S1","n":1,"text":"지역 활동 탐색에서 경험한 검색·추천 개념을 발전시켜 데이터 모델링부터 보완성 기준 알고리즘, 프로토타입까지 만든 성장을 느꼈다.","hash":"dba02d5f5245db72"},{"sid":"N25·V1·S2","n":2,"text":"다만 가상 학생 30명 시뮬레이션이라 실제 팀워크 향상에 기여했는지 객관적 검증은 못 했다는 걸 배웠고 다음 과제로 남겼다.","hash":"69a7997aa18efefe"}]$j$::jsonb);
  insert into public.experiences (owner_id, project_id, record_version_id, tags, source, rule_version) values
    (uid, '3f28d2b0-fd5c-5ff1-a748-36c375f88c56', '759d93df-df44-5aa7-a271-5ec7460b842a', $j$[{"code":"D10","matched":"알고리즘","sid":"N25·V1·S1"},{"code":"M16","matched":"데이터 모델링","sid":"N25·V1·S1"},{"code":"O06","matched":"프로토타입","sid":"N25·V1·S1"}]$j$::jsonb, 'rule', 'v0.5');
  insert into public.experiences (owner_id, project_id, fields, source) values
    (uid, '3f28d2b0-fd5c-5ff1-a748-36c375f88c56', $j${"role":{"text":"데이터 모델링 · 추천 기준 설계 · Python 프로토타입 개발 · 프로젝트 기획","sids":[]},"activity":{"text":"데이터 모델링 / 추천 알고리즘 / 프로토타입","sids":[]},"problem":{"text":"팀 프로젝트에서 친분 위주로 팀이 꾸려져 역할이 편중되고, 역량에 맞는 팀원을 찾기 어려웠습니다.","sids":[]},"process":{"text":"가상 학생 30명의 이력으로 경험 DB 스키마를 설계하고, 관심사 유사도 40%와 역할 충족도 60%를 합친 추천 공식을 정의해 Python으로 Top 3 추천 로직을 구현했습니다.","sids":[]},"result":{"text":"역할 보완성을 반영한 팀원 추천 프로토타입을 완성하고 정상 작동을 시연했습니다.","sids":[]},"reflection":{"text":"가상 데이터 시뮬레이션이라 실제 팀워크 향상 효과는 검증하지 못했습니다.","sids":[]}}$j$::jsonb, 'student');
  insert into public.analysis_runs (owner_id, purpose, input_refs, rule_version, threshold, relations) values
    (uid, 'graph', array['dc976c51-e69b-5938-ae57-3350be667628','587c2d56-0618-558c-aa30-91fdd2971813','39f991d6-7dc8-5502-ae6c-fb955c13f4d4','1a202d0c-e7f8-5186-ad18-becb6f9028e6','f43c456d-c540-56db-a7fd-4a113614451f','deaae5cb-771f-5be8-a9b0-a71902999d7c','eea00a7d-9b08-5557-af14-d0056bd7995c','e99b6bd8-0643-5033-a320-162cb241552f','10c1cc4a-2dc9-5f32-ace0-3eacf71035c5','57a53a6f-1d03-55f8-ae04-18f01e0b2ce8','bcd17380-1c50-5608-a2d6-0f5d0d98c7f2','9f020529-9faf-5cf0-ae49-bccc014bc753','0e53b9c4-9170-5c87-ac7f-51d112f0563a','5d2f60b6-f94e-55cf-abe7-5443b6ff9cd6','4ad4ce67-b085-545a-ad0f-858b7e71622a','3b19548c-82c4-5c64-a5ad-28b89f31697e','cbc8aff0-3b5d-5612-a7a7-54d600acdfe8','02107092-ab85-55a0-a802-041864f01add','c7d735ba-9cf3-5ede-a12b-7f23901d4439','1ef6b230-8fc0-5bba-a52d-03889ca01a85','9a4ba00d-e6d2-5c5f-ad4b-f4ccc39d31cb','c072316a-1b14-561e-a28d-0470faf20c34','8d2dd56b-c6fe-52e1-a7c6-10ca967edd11','8a1facf0-1abf-5a37-aae8-c901312f4233','759d93df-df44-5aa7-a271-5ec7460b842a']::uuid[], 'v0.5', 0.18, $j$[{"a":"aaf98e4c-1b05-579b-acbf-aac5cea58c5e","b":"467e9afb-fbfc-52e4-a5c9-ddd440e1d780","score":0.239,"shared":["M06","O02","M03","D03"],"evidence":{"aaf98e4c-1b05-579b-acbf-aac5cea58c5e":["N3·V1·S1","N5·V1·S1","N2·V1·S1","N1·V1·S3"],"467e9afb-fbfc-52e4-a5c9-ddd440e1d780":["N11·V1·S2","N12·V1·S2","N13·V1·S1","N15·V1·S1","N12·V1·S1","N11·V1·S1","N11·V1·S2","N12·V1·S1","N15·V1·S1"]}},{"a":"51f4ea94-f0d8-596d-a60e-619b0e942917","b":"3f28d2b0-fd5c-5ff1-a748-36c375f88c56","score":0.172,"shared":["M16","M23"],"evidence":{"51f4ea94-f0d8-596d-a60e-619b0e942917":["N17·V1·S1","N18·V1·S1"],"3f28d2b0-fd5c-5ff1-a748-36c375f88c56":["N21·V1·S2","N22·V1·S1","N25·V1·S1","N24·V1·S2"]}},{"a":"aaf98e4c-1b05-579b-acbf-aac5cea58c5e","b":"51f4ea94-f0d8-596d-a60e-619b0e942917","score":0.134,"shared":["M22","M03"],"evidence":{"aaf98e4c-1b05-579b-acbf-aac5cea58c5e":["N1·V1·S2","N2·V1·S1"],"51f4ea94-f0d8-596d-a60e-619b0e942917":["N18·V1·S1","N16·V1·S2"]}},{"a":"467e9afb-fbfc-52e4-a5c9-ddd440e1d780","b":"3f28d2b0-fd5c-5ff1-a748-36c375f88c56","score":0.106,"shared":["M14","D10"],"evidence":{"467e9afb-fbfc-52e4-a5c9-ddd440e1d780":["N13·V1·S1","N12·V1·S2"],"3f28d2b0-fd5c-5ff1-a748-36c375f88c56":["N22·V1·S2","N25·V1·S1"]}},{"a":"594a5db9-9b19-51a3-ad1d-eac96992090d","b":"3f28d2b0-fd5c-5ff1-a748-36c375f88c56","score":0.103,"shared":["O06","M14"],"evidence":{"594a5db9-9b19-51a3-ad1d-eac96992090d":["N10·V1·S1","N6·V1·S1"],"3f28d2b0-fd5c-5ff1-a748-36c375f88c56":["N25·V1·S1","N22·V1·S2"]}},{"a":"aaf98e4c-1b05-579b-acbf-aac5cea58c5e","b":"594a5db9-9b19-51a3-ad1d-eac96992090d","score":0.057,"shared":["D02","T04"],"evidence":{"aaf98e4c-1b05-579b-acbf-aac5cea58c5e":["N2·V1·S1","N3·V1·S1","N3·V1·S1"],"594a5db9-9b19-51a3-ad1d-eac96992090d":["N10·V1·S3","N7·V1·S3"]}},{"a":"594a5db9-9b19-51a3-ad1d-eac96992090d","b":"51f4ea94-f0d8-596d-a60e-619b0e942917","score":0.053,"shared":["M05"],"evidence":{"594a5db9-9b19-51a3-ad1d-eac96992090d":["N7·V1·S1"],"51f4ea94-f0d8-596d-a60e-619b0e942917":["N19·V1·S2","N20·V1·S1"]}},{"a":"467e9afb-fbfc-52e4-a5c9-ddd440e1d780","b":"51f4ea94-f0d8-596d-a60e-619b0e942917","score":0.051,"shared":["M03"],"evidence":{"467e9afb-fbfc-52e4-a5c9-ddd440e1d780":["N12·V1·S1"],"51f4ea94-f0d8-596d-a60e-619b0e942917":["N16·V1·S2"]}},{"a":"594a5db9-9b19-51a3-ad1d-eac96992090d","b":"467e9afb-fbfc-52e4-a5c9-ddd440e1d780","score":0.039,"shared":["M14"],"evidence":{"594a5db9-9b19-51a3-ad1d-eac96992090d":["N6·V1·S1"],"467e9afb-fbfc-52e4-a5c9-ddd440e1d780":["N13·V1·S1"]}}]$j$::jsonb);

  perform setval(pg_get_serial_sequence('public.records', 'no'), (select max(no) from public.records));
end $seed$;
