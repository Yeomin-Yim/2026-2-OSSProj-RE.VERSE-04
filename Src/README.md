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
│  │  ├─ postings/public.ts    공공기관 공고 고르기: 직무 → NCS·제목 단어, 배지·전형 단계·체크리스트
│  │  ├─ gcam-import/gcam.ts   거캠 회고록 가져오기: 칸 나누기, AI 묶음 바로잡기
│  │  └─ index.ts              위 전부를 내보낸다. 화면에서는 "@/lib/core/index.ts" 하나로 불러 쓴다
│  ├─ server/                  DB 읽기·쓰기 + 외부 API. 서버에서만 실행
│  │  ├─ auth.ts               공통: 로그인 확인 (요청마다 한 번)
│  │  ├─ dictionary.ts         공통: 활성 규칙 사전 읽기
│  │  ├─ openai.ts             공통: OpenAI 호출 (구조화 출력)
│  │  ├─ projects/             프로젝트 탭: projects.ts(조회·저장), records.ts(기록 저장: 버전 → 문장 → 태그), files.ts(파일 올리기) (README.md)
│  │  ├─ graph/                연결 그래프: 연결선 계산 · 조회
│  │  ├─ explore/              진로 탐색: explore.ts(관점별 추천·대학·공고 조립), similar.ts("기록과 닮은": 임베딩 후보 → AI 선택, 결과는 profiles.ui_state),
│  │  │                        publicPostings.ts(공공기관 공고: public_postings 표), postings.ts(사람인, 키 있을 때)
│  │  ├─ student/              학생 기능 표: notes(graph_notes·note_projects) · scraps · todos · portfolio
│  │  └─ gcam-import/          거캠 회고록 가져오기: import.ts(업로드→읽기→묶기→저장), ocr.ts, group.ts, draft.ts — 화면은 아직 (README.md)
│  └─ supabase/                공통: Supabase 연결 (서버용 클라이언트, 세션 갱신)
├─ scripts/                    데이터 수집 (아래 "데이터 모으기"). DB 쓰기는 서버 키(SUPABASE_SERVICE_ROLE_KEY)로만
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
| 개요 탭 AI 정리 | 실제 연결 | `generateOverview` · `lib/server/projects/overview-ai.ts` |
| 회원가입 · 아이디 찾기 · 비밀번호 찾기 | 실제 연결 | `/signup` `/find-id` `/forgot` `/reset` · `/auth/confirm` (0011 `find_login_emails`) |
| 파일 올리기 (PDF·DOCX·사진) · 원본 파일 보기 | 실제 연결 | `lib/server/projects/README.md` |
| 거캠 회고록 가져오기 | 실제 연결 | `lib/server/gcam-import/README.md` (쪽별 동시 OCR, 확인 필요 최소화) |
| 기록 저장 뒤 키워드 정리 | 실제 연결 | `lib/server/keywords/README.md` · 실패 시 15분 재시도 보류 |
| 연결 그래프 > 프로젝트 연결 | 실제 연결 | `latestRelations` (기준 0.10, 흔한 활동 가볍게, 과목끼리 연결 제외) |
| 진로 탐색 > 추천 학과·직무 (관점 4개: 종합·많이 해 온 것·깊게 해 본 것·관심) | 실제 연결 | 점수표 `major_profiles` `job_profiles` (학과 33·직업 31) × 내 키워드 축 |
| 진로 탐색 > **기록과 닮은** (관점 5번째) | 실제 연결 | `career_catalog`(커리어넷 학과 501·직업 552, 임베딩) → 프로젝트별 후보(`catalog_nearest`) → AI 가 고르고 이유. 학생별로 `profiles.ui_state.similar` 에 저장, 기록이 같으면 재계산 없음 |
| 진로 탐색 > 개설 대학 | 실제 연결 | `universities` (학과 약 500개). 정렬: 대안학교 전형 → 검정고시 지원 가능 → 동국대 → 서울 |
| 진로 탐색 > 대학 **지원 가능 정보** | 실제 연결 | `admission_rules` (2027 수시 모집요강 원문, 전형별 검정고시 가능·대체서식·대안학교 전형, PDF 쪽·확인일). 본교(제1캠퍼스)에만 붙인다 |
| 진로 탐색 > 채용공고 | 실제 연결 | `public_postings` (공공기관, Supabase 가 매일 06:07 수집). 진행 중·최신순, 배지·전형 단계·자동 체크리스트·첨부. 직업 552개 매칭 규칙 `career_catalog.extra` |
| 스크랩 (필터 · 메모 · 체크리스트 · 원래 위치로 이동) | 실제 연결 | `scraps` `todos`. 공고 스크랩은 아직(아래 남은 작업) |
| 포트폴리오 1~3단계 · AI 초안 · 인쇄 · 자동 저장 | 실제 연결 | `portfolios` · `lib/server/student/portfolio-ai.ts` |
| 포트폴리오 문장 다듬기 · 프로필(자기소개) · 대체서식 AI | **서버 기능 필요** | 버튼은 "AI 미연결"로 비활성 |
| 시연 모드 (`/graph?demo=1`) | 예시 데이터만 | `components/explore/demo.ts` |

## 데이터 모으기 (한 번 모아 DB 에 쌓고, 바뀐 것만 다시)

| 데이터 | 방법 | 다시 할 때 |
|---|---|---|
| 커리어넷 학과·직업 원문 | `scripts/fetch_careernet_all.ts` → `scripts/upload_career_catalog.ts` (임베딩, 원문 해시가 같으면 재계산 없음 · 1,053개 약 $0.02) | 연 1회 |
| 개설 대학 | `scripts/fetch_universities.ts` (30일 안에 받은 학과는 건너뜀) | 연 1회 |
| 직업별 공고 매칭 규칙 | `scripts/build_job_ncs.ts` (직업 40개씩 AI 1회, 이미 있으면 건너뜀) | 카탈로그 갱신 때 |
| 공공기관 채용공고 | Supabase `pg_cron` + `pg_net` (0012·0013). 키는 Vault `data_go_kr_key` | 자동 (매일) |
| 대학 모집요강 → 전형별 지원 가능 정보 | `scripts/fetch_admissions.ts` (PDF 해시가 같으면 재추출 없음, 이미지 PDF 는 OCR). 원문 주소는 기본 저장소 + `zz_local/admissions/sources_<연도>.json`(캠퍼스·쪽 범위, 로컬 전용). 정답 표본 채점: `zz_local/admissions/eval_gt.ts`(로컬 전용) | 학년도마다 (매년 5~6월 요강 공개 뒤) |

마이그레이션은 `supabase/migrations/` 0010~0014 가 이번에 추가됐다 (적용 완료).

## AI 사용 원칙과 비용 (근거: 판단기록·발표 기록 — `zz_local/`, 로컬 전용·저장소 제외)

1. AI 는 **후보 중에서 고르기·설명만** 한다. 근거(어느 프로젝트·원문 몇 쪽)는 시스템이 붙인다.
2. **같은 입력은 다시 부르지 않는다** — 해시·처리 이력·`ui_state` 저장. 화면이 열릴 때마다 AI 를 부르지 않는다.
3. **실패하면 기다린다** — 키워드 정리·닮은 추천은 실패 후 15분 동안 재시도하지 않는다 (자동 새로고침이 AI 를 반복 호출하지 않게).
4. **스크립트 비용 상한** — `fetch_admissions.ts` 는 예상 입력이 60만 토큰을 넘으면 `--yes` 없이 실행하지 않는다. 전체 재수집은 정답 표본 회귀가 통과한 뒤 한 번만.
5. 정확도는 **정답 표본으로 잰다** — 모집요강 추출: 표본 66개 전형 검정고시 판단 100%, "불가인데 가능" 0. 공고 매칭: 새로 붙은 직업 표본 정확도 약 80%.

## 남은 작업 (이상향 기준: "거캠 학생이 기록만 하면, 근거가 분명한 학과·대학·직무·공고와 제출 서류 초안까지 받는다")

**A. 데이터 넓이**
1. 모집요강 원문 확보 80/341곳(4년제). 남은 대학은 입학처(*.ac.kr) PDF 주소를 `sources_2027.json` 에 추가. 한동대(대안학교 전형, admissions.handong.edu)는 도메인 허용 대기.
2. 2028학년도 요강이 나오면 같은 스크립트로 갱신 (연도 인자).
3. 점수표(학과 33·직업 31)는 종합·관점 계산에만 쓰인다 → "기록과 닮은" 상위 후보 중 점수표 없는 곳을 자동 생성해 넓히기 (`scripts/build_keyword_profiles.ts`).

**B. 정확도·신뢰**
1. 모집요강 정답 표본을 팀원이 교차 확인 (지금은 1인 작성). 처음 보는 대학 표본도 더 늘리기.
2. "기록과 닮은" 추천의 사람 평가 — 학생 34명 블라인드 평가표(종합 vs 닮은, 1~5점)로 엉뚱한 추천 비율 측정.
3. 공고 매칭 오연결(약 20%) 줄이기 — AI 단어 생성 프롬프트에 "다른 직종에서도 흔한 말 금지".
4. 종합·관점 추천의 이유 문장도 AI 설명으로 (지금은 규칙 문장 "겹친 부분").

**C. 아직 없는 기능**
1. 포트폴리오 문장 다듬기 · 프로필(자기소개) · 대체서식 AI (`refineText` 계약은 아래).
2. 공고 스크랩 — `scraps.type` 에 `'posting'` 추가 마이그레이션 + ★ 버튼.
3. 태그 수정 이어받기 (`lib/server/projects/records.ts` TODO), 노트 검색·알림 (프로토타입에는 있음).

**D. 운영**
1. OpenAI 사용 한도(대시보드) 설정, 크레딧 소진 시 화면 안내 문구 점검.
2. 실제 브라우저로 새 화면 확인: 기록과 닮은 탭 · 대학 지원 가능 패널 · 공고 카드 · 모바일 폭.
3. 메일: Supabase 기본 SMTP 는 팀원에게만 발송 → Brevo SMTP 연결.
4. 테스트 계정(e2e-bot·e2e-real) 정리 여부, 연결 기준 0.10 팀 공유.

문장 다듬기 서버 액션 계약 예: `refineText(mode: 'concise'|'role'|'rewrite', text) → { text, changed }`. 연결되면 `PortfolioWizard` 의 비활성 버튼만 켠다.
AI 글의 근거 검증은 `lib/core/evidence.ts` 하나로 한다.

## 배포 (Vercel)

1. Vercel에서 저장소를 가져올 때 **Root Directory =** `Src`
2. Environment Variables에 `Src/.env.example`의 항목 등록
3. Supabase → Authentication → URL Configuration의 Site URL에 배포 주소 입력, Redirect URLs에 `https://배포주소/auth/confirm` 추가 (가입 확인 메일이 돌아오는 곳)

### (Vercel 로그인 필요)

```bash
cd Src
vercel --prod
```