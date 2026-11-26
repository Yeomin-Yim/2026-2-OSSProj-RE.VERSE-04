# Src — RE:Cord 웹 앱 (Next.js)

로그인 → 프로젝트 → 기록 저장 → 태그·보완 질문·연결선까지 이어지는 앱입니다.
화면은 `prototype/`의 HTML과 같은 모양입니다. 프로토타입의 `<style>`을 `app/styles/prototype.css`에
그대로 옮겨 쓰므로, 화면을 만들 때는 **프로토타입과 같은 class 이름**을 쓰면 됩니다.

## 실행

```bash
cd Src
cp .env.example .env.local     # 값 채우기 (Supabase → Settings → API)
npm install
npm run dev                    # http://localhost:3000
npm test                       # 계산 로직 테스트
```

Node 22.18 이상이 필요합니다. 테스트 계정은 `supabase/README.md`의 시드 설명을 참고하세요.

## 폴더

```
Src/
├─ app/                        화면 (주소와 폴더가 1:1)
│  ├─ login/                   로그인 · 로그아웃
│  ├─ (app)/                   로그인 뒤 화면. layout.tsx 가 왼쪽 메뉴 + 위쪽 바를 그린다
│  │  ├─ projects/             /projects → 첫 프로젝트로 이동
│  │  │  ├─ actions.ts         서버 액션 (프로젝트 · 기록 저장 · 옮기기 · 파일 올리기). { ok, message } 를 돌려준다
│  │  │  │  ├─ importActions.ts   서버 액션 (거캠 회고록 가져오기)
│  │  │  └─ [id]/page.tsx      프로젝트 관리 화면에 필요한 데이터를 한꺼번에 읽는다
│  │  ├─ graph/                연결 그래프. page.tsx: 진로 탐색(기본) · ?view=links 프로젝트 연결 · ?demo=1 시연 모드
│  │  │  └─ actions.ts         서버 액션 (그래프 노트 · 스크랩 · 체크리스트 · 탐색 위치)
│  │  ├─ scraps/               스크랩 (scraps · todos 표)
│  │  └─ portfolio/            포트폴리오 만들기 3단계 (?step=1|2|3). actions.ts: portfolios 표 저장
│  ├─ styles/prototype.css     프로토타입 스타일 원본 (직접 고치지 않는다)
│  └─ globals.css              프로토타입에 없는 화면용 추가 스타일
├─ components/
│  ├─ ui/                      Icon · Modal · Toast · Notice(경고 배너) (어느 화면에서나 쓰는 것)
│  ├─ student/StudentData.tsx  스크랩 ★ 버튼 · 해야 할 일 체크리스트 (여러 화면이 같이 쓰는 상태)
│  ├─ explore/                 진로 탐색 그래프 (프로토타입 #/learning 이식)
│  │  ├─ ExploreGraph.tsx      진입 선택 · 생성 모션 · SVG 그래프 · 오른쪽 패널 · 채용공고 목록
│  │  ├─ layout.ts             배치 (프로토타입 buildData 그대로, 라이브러리 없음)
│  │  ├─ NoteDock.tsx          그래프 아래 노트 · 프로젝트 패널, 새 노트 창
│  │  ├─ info.ts               준비 정보 선택지 · 기본 체크리스트 (실제 모드에서도 쓰는 일반 안내)
│  │  └─ demo.ts               ⚠ 시연 모드 전용 예시 데이터 (프로토타입 RC.mock)
│  ├─ scraps/ScrapsView.tsx    스크랩 화면
│  ├─ portfolio/               PortfolioWizard.tsx(3단계) · Sheets.tsx(사람인 디자인 포트폴리오 · 동국대 대체서식 인쇄본)
│  ├─ shell/                   Sidebar · Topbar
│  ├─ graph/                   연결 그래프: GraphView.tsx(SVG 그림 + 오른쪽 패널), layout.ts(배치 계산, 라이브러리 없음)
│  ├─ gcam-import/             거캠 회고록 가져오기: ImportModal.tsx(올리기→읽기→묶기→저장), DraftEditor.tsx(미리보기·수정)
│  └─ projects/                프로젝트 관리 화면
│     ├─ ProjectsView.tsx      3단 구성의 뼈대 (목록 · 상세 탭 · 오른쪽 패널)
│     ├─ NoteList.tsx          자료 목록과 ⋮ 메뉴 (내용 보기 · 결과물 · 옮기기 · 삭제)
│     ├─ NoteModal.tsx         내용 보기 · 본문 수정 · 원본 파일 · 사진 미리보기
│     ├─ AddNoteModal.tsx      자료 추가: 파일 · 링크 · 메모
│     ├─ FileUploadPanel.tsx   파일 올리기 (PDF · DOCX · 사진, 여러 개를 차례로)
│     ├─ MoveNoteModal.tsx     노트를 다른 프로젝트로 옮기기
│     ├─ ProjectModal.tsx      새 프로젝트 · 수정 · 삭제
│     ├─ OverviewTab.tsx       개요 6항목
│     ├─ RightPanel.tsx        보완 제안 · 기록 확인 · 프로젝트 태그
│     └─ format.ts             날짜 · 종류 표시 형식
├─ lib/                        백엔드. 기능별 폴더 + 여러 기능이 같이 쓰는 파일은 폴더 밖
│  ├─ core/                    계산 로직. DB·화면과 무관한 순수 함수 (lib/core/README.md)
│  │  ├─ text · sentences · tagger · types   공통: 글 정리, 문장 ID, 규칙 태깅
│  │  ├─ projects/checks.ts    프로젝트 탭: 기록 확인 7항목, 보완 질문
│  │  ├─ graph/graph.ts        연결 그래프: 프로젝트 연결 점수
│  │  ├─ recommend/            학과·직무 추천 점수 (진로 탐색 그래프가 사용)
│  │  ├─ portfolio/            포트폴리오 서식(templates.ts) · 개요 옮기기 · AI 지시문(draft.ts). AI 아님
│  │  ├─ gcam-import/gcam.ts   거캠 회고록 가져오기: 칸 나누기, AI 묶음 바로잡기
│  │  └─ index.ts              위 전부를 내보낸다. 화면에서는 "@/lib/core/index.ts" 하나로 불러 쓴다
│  ├─ server/                  DB 읽기·쓰기 + 외부 API. 서버에서만 실행
│  │  ├─ auth.ts               공통: 로그인 확인 (요청마다 한 번)
│  │  ├─ dictionary.ts         공통: 활성 규칙 사전 읽기
│  │  ├─ openai.ts             공통: OpenAI 호출 (구조화 출력)
│  │  ├─ projects/             프로젝트 탭: projects.ts(조회·저장), records.ts(기록 저장: 버전 → 문장 → 태그), files.ts(파일 올리기) (README.md)
│  │  ├─ graph/                연결 그래프: 연결선 계산 · 조회
│  │  ├─ explore/              진로 탐색: 점수표(major_profiles·job_profiles) × 내 기록 태그 → 추천, universities
│  │  ├─ student/              학생 기능 표: notes(graph_notes·note_projects) · scraps · todos · portfolio
│  │  └─ gcam-import/          거캠 회고록 가져오기: import.ts(업로드→읽기→묶기→저장), ocr.ts, group.ts, draft.ts — 화면은 아직 (README.md)
│  └─ supabase/                공통: Supabase 연결 (서버용 클라이언트, 세션 갱신)
├─ tests/                      npm test 로 도는 단위 테스트 (core/ 계산 로직, gcam/ 거캠 칸 나누기, graph/ 그래프 배치 · 진로 탐색 배치, portfolio/ 포트폴리오)
├─ .env.example                환경변수 목록 (저장소에서 유일한 .env.example)
├─ proxy.ts                    모든 요청에서 로그인 확인
├─ vercel.json                 서버 위치를 서울(icn1)로 — Supabase 와 같은 지역
└─ prototype/                  중간 체크인 HTML 프로토타입 (디자인 기준)
```

**데이터가 흐르는 방향**: `components`(화면) → `actions.ts`(서버 액션) → `lib/server`(DB) → `lib/core`(계산).
화면에서 DB를 직접 부르지 않고 `lib/server`의 함수를 씁니다.

## 기록을 저장하면

`lib/server/projects/records.ts`의 `createRecord`가 순서대로 실행합니다.

1. `records`에 기록 생성 (문장 ID에 쓸 번호 `no` 발급)
2. `record_versions`에 버전 1 저장 + 문장 분리
3. 규칙 사전으로 태깅 → `experiences`(source=rule)
4. 프로젝트 연결선 재계산 → `analysis_runs`(purpose=graph). 응답을 보낸 뒤에 실행 (`actions.ts`의 `after`)

본문을 고치면 `updateRecordText`가 해시를 비교해, 바뀌었을 때만 새 버전을 만듭니다.

## 화면 연결 상태

왼쪽 메뉴 4개(프로젝트 관리 · 연결 그래프 · 스크랩 · 포트폴리오 만들기)는 모두 프로토타입 HTML과 같은 구성입니다.

| 화면 · 기능 | 상태 | 데이터 · 서버 기능 |
|---|---|---|
| 프로젝트 관리 (목록 · 탭 · 보완 제안 · 기록 확인) | 실제 연결 | `projects` `records` `experiences` |
| 개요 탭 AI 정리 (6항목 · 근거 문장 확인 · 고쳐서 저장) | 실제 연결 | `generateOverview` · `lib/server/projects/overview-ai.ts`. AI 결과는 `experiences`(source=ai), 학생이 저장한 글은 source=student |
| 회원가입 · 가입 확인 메일 | 실제 연결 | `/signup` · `/auth/confirm` |
| 파일 올리기 (PDF·DOCX·사진) · 원본 파일 보기 | 실제 연결 | `prepareFile` `addFile` `openFile` · `lib/server/projects/README.md` |
| 거캠 회고록 가져오기 | 실제 연결 | `importActions.ts` · `lib/server/gcam-import/README.md` |
| 노트 옮기기 | 실제 연결 | `moveRecord` |
| 프로젝트 > 연결 노트 탭 · 개요 탭 체크리스트 | 실제 연결 | `graph_notes` `note_projects` `todos` |
| 연결 그래프 > 프로젝트 연결 (`?view=links`) | 실제 연결 | `latestRelations` (서버 계산값·기준값 그대로, 연결 없는 프로젝트는 따로 떨어진 점) |
| 연결 그래프 > 진로 탐색: 진입 선택 · 탐색 경로 · 노트 · 스크랩 · 체크리스트 · 마지막 위치 | 실제 연결 | `graph_notes` `scraps` `todos` `profiles.ui_state` |
| 진로 탐색 > 추천 학과 · 직무 | 화면 연결 완료, **데이터 필요** | `scoreProfiles(내 기록 태그, major_profiles/job_profiles)`. 점수표가 비어 있으면 "준비 중" 안내 |
| 진로 탐색 > 개설 대학 | 화면 연결 완료, **데이터 필요** | `universities` (학과 코드별). 비어 있으면 안내 |
| 진로 탐색 > 채용공고 | **서버 기능 필요** | 표·수집 기능 없음 → 안내만. 예시는 시연 모드에서만 |
| 스크랩 (필터 · 메모 · 체크리스트 · 원래 위치로 이동) | 실제 연결 | `scraps` `todos`. 채용공고 탭은 빈 상태 |
| 포트폴리오 1~3단계 · 미리보기 · 인쇄 · 자동 저장 | 실제 연결 | `portfolios` (template_id · project_ids · content · profile · alt · built_at) |
| 포트폴리오 AI 초안 (2단계 "초안 만들기" · 3단계 "AI 초안 다시 만들기") | 실제 연결 | `draftProject` · `lib/server/student/portfolio-ai.ts`. 원본은 `portfolios.draft`, 고친 글은 `content` |
| 포트폴리오 문장 다듬기 · 프로필 · 대체서식 AI | **서버 기능 필요** | 버튼은 "AI 미연결"로 비활성 |
| 시연 모드 (`/graph?demo=1`) | 예시 데이터만 | `components/explore/demo.ts`. 띠로 구분, 스크랩·체크리스트 저장 안 함 |

## 서버 기능이 더 필요한 것 (화면은 준비됨)

1. **학과·직무 점수표 · 대학 목록 수집** — `major_profiles` `job_profiles` (`weights = {태그코드: 1~3}`), `universities` (`major_code`).
   넣는 방법은 `supabase/README.md`의 "점수표 · 대학 목록 넣기".
   들어오면 화면 수정 없이 `lib/server/explore/explore.ts`의 `loadExplore`가 추천을 계산해 보여 준다. 계산 결과를 `analysis_runs`(purpose=college|career)에 남기려면 같은 파일에서 저장만 추가한다.
2. **채용공고** — 표 예: `job_postings(id, job_code, company, title, location, deadline, requirements text[], preferred text[], summary, url, fetched_at)`.
   화면은 `ExNode.posting` 모양을 쓴다 (`loadExplore`의 `career.next[직무 id]`에 `kind: "posting"` 노드로 넣으면 된다).
   스크랩하려면 `scraps.type` check 에 `'posting'`을 더하는 마이그레이션이 필요하다 (지금은 `major·job·university·note·project`만 허용).
3. **문장 다듬기** — 서버 액션 계약 예: `refineText(mode: 'concise'|'role'|'rewrite', text) → { text, changed }`. 연결되면 `PortfolioWizard`의 비활성 버튼만 켠다.

AI 글의 근거 검증은 `lib/core/evidence.ts` 하나로 한다: AI에게 `[문장ID] 문장`으로 기록을 보내고, 돌아온 문장 ID 중 실제로 보낸 것만 남기며, 근거가 하나도 없는 글은 비운다.

## 아직 없는 것

- 태그 수정, 위쪽 바의 노트 검색·알림 (프로토타입에는 있음)

## 배포 (Vercel)

1. Vercel에서 저장소를 가져올 때 **Root Directory =** `Src`
2. Environment Variables에 `Src/.env.example`의 항목 등록
3. Supabase → Authentication → URL Configuration의 Site URL에 배포 주소 입력, Redirect URLs에 `https://배포주소/auth/confirm` 추가 (가입 확인 메일이 돌아오는 곳)

### (Vercel 로그인 필요)

```bash
cd Src
vercel --prod
```