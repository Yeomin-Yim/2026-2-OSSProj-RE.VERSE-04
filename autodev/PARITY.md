# 기능 대조표 (발표·프로토타입 ↔ 코드)

반복 #001 첫 판. 근거는 코드 grep·파일 읽기·DB count·화면 1장. "미확인"은 아직 화면으로 확인 안 한 것. 반복마다 고친다.
상태: ✅ 동작 확인 · 🟡 있음(일부/미확인) · ❌ 없음

| 영역 | 기능 (근거) | 코드 | 상태 |
|---|---|---|---|
| 공통 | 사이드바·탑바·토스트·모달 | `components/shell/*`, `components/ui/*` | ✅ (shots/001) |
| 공통 | 전역 검색: 프로젝트·노트·경험키워드·그래프노트 (proto `search()`) | `Topbar.tsx:29` 프로젝트 제목·주제만 | 🟡 |
| 공통 | 사용자 메뉴 | `Topbar.tsx` 로그아웃만 | 🟡 |
| 공통 | 로그인·회원가입·로그아웃·RLS | `app/login`, `app/signup`, `0002_rls.sql` | 🟡 미확인 |
| 공통 | 모바일 390px | `prototype.css` @media 6개 | 🟡 미확인 |
| ① | 프로젝트 목록·생성·수정·삭제 | `ProjectsView`, `ProjectModal`, `projects/actions.ts` | 🟡 미확인 |
| ① | 기록 추가(링크·메모)·상세(문장·태그)·수정=새 버전·이동 | `AddNoteModal`, `NoteModal`, `editRecord`, `MoveNoteModal` | 🟡 미확인 |
| ① | 파일 올리기(PDF·DOCX·사진) | `FileUploadPanel`, `lib/server/projects/files.ts` | 🟡 미확인 |
| ① | 거캠 가져오기 (업로드→진행률→묶기 미리보기→저장) | `ImportModal`, `DraftEditor`, `lib/server/gcam-import/*` | 🟡 미확인 |
| ① | 태그 고치기(추가·삭제, 학생 수정 우선) | 없음 (grep 0건). 프로토타입에도 칩 편집 UI 없음 → wireframe 확인 필요 | ❌ |
| ① | 기록 확인 7항목 + 보완 질문(최대 2) → 메모 저장 | `lib/core/projects/checks.ts`, `RightPanel`, `saveAnswer` | 🟡 미확인 |
| ① | ✦ AI 개요 6항목 + 근거 검증 + 학생 수정 | `OverviewTab`, `overview-ai.ts` | 🟡 미확인 |
| ② | 프로젝트 연결 그래프(자카드 ≥0.18, 간선 근거) | `GraphView`, `/graph?view=links`, `lib/core/graph` | 🟡 미확인 |
| ② | 진로 탐색: 진학/취업 → 추천(넓이0.5+깊이0.5) → 근거 프로젝트 | `ExploreGraph`, `lib/server/explore/explore.ts`, `lib/core/recommend` | ✅ 취업 (shots/001, D003로 점수표 채움) |
| ② | 학과 → 개설 대학 | `explore.ts:136` (universities 표) | ❌ DB 0행 (T05b) |
| ② | 직무 → 채용공고 / 준비 정보 | 공고 표 없음(정직한 빈 목록), 준비 정보 `info.ts` | 🟡 |
| ② | 노드 독·연결 노트(여러 프로젝트) | `NoteDock`, `graph/actions.ts` | 🟡 미확인 |
| ② | ✦ 추천 근거 설명(AI) | 없음 | ❌ |
| ② | "합격 가능성 아님" 문구 | 오른쪽 패널 안내 | ✅ (shots/001) |
| ③ | 1 서식 선택 · 2 프로젝트 선택 · 3 편집 · 순서 변경 | `PortfolioWizard` | 🟡 미확인 |
| ③ | ✦ 근거 문장만으로 초안 (sid 검증) | `portfolio-ai.ts` `keepCited` | 🟡 미확인 |
| ③ | 문장마다 "참고한 기록"(sid) 표시 | 오른쪽은 프로젝트 기록 목록만, 초안 sid 미표시 | 🟡 |
| ③ | ✦ 문장 다듬기 3종 + diff + 적용 (wireframe 463) | `PortfolioWizard.tsx:388` "AI 미연결" 비활성 버튼 | ❌ (T08c) |
| ③ | 초안(draft)·수정본(content) 분리, "초안으로 되돌리기" | draft 저장은 있음, 되돌리기 UI 없음 | 🟡 |
| ③ | 프로필·자기소개, 미리보기·인쇄 | `profileEditor`, `Sheets.tsx`, `printNow` | 🟡 미확인 |
| ③ | 대체서식 표 편집·체크리스트 | `AltSheet`, `step3Alt` | 🟡 미확인 |
| ④ | 스크랩·메모·할 일·원래 위치로 이동 | `ScrapsView`, `scraps.ts`, `todos.ts` | 🟡 미확인 |
| 데이터 | 점수표 시드 | `supabase/seed/build_profiles.ts --draft --apply` | ✅ 학과 9·직무 10 (초안) |
| 데이터 | 대학 목록 시드 | 커리어넷 MAJOR_VIEW univ_list 로 가능(569 → 248개) | ❌ T05b |
| 데이터 | 시드 학생 김서윤 | `seed_seoyun.sql`, DB에 프로젝트 5·기록 26 | ✅ |

## 환경 메모 (다음 반복용)
- 화면 확인: `zz_local/autodev/shot.mjs` (playwright 설치됨). 매직링크로 seoyun@record.test 로그인.
  `MSYS_NO_PATHCONV=1 node --env-file=../../Src/.env.local shot.mjs seoyun@record.test <png> /graph "취업"` (zz_local/autodev 에서, BASE 기본 http://localhost:3123)
- dev 서버: `node node_modules/next/dist/bin/next dev --port 3123` (Src). rtk 가 `npx next dev -p` 를 깨뜨림.
- DB DDL(마이그레이션 적용) 수단 없음: psql·supabase CLI·DB 비밀번호 없음. service role REST 만 가능. service role 은 `keywords` 등 0008 이후 표에 권한 없음(42501).
