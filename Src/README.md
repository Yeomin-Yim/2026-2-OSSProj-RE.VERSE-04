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
│  │  └─ graph/                연결 그래프 (데이터 조회 → components/graph/GraphView)
│  ├─ styles/prototype.css     프로토타입 스타일 원본 (직접 고치지 않는다)
│  └─ globals.css              프로토타입에 없는 화면용 추가 스타일
├─ components/
│  ├─ ui/                      Icon · Modal · Toast (어느 화면에서나 쓰는 것)
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
│  │  ├─ recommend/            학과·직무 추천 점수 (화면은 아직 없음)
│  │  ├─ gcam-import/gcam.ts   거캠 회고록 가져오기: 칸 나누기, AI 묶음 바로잡기
│  │  └─ index.ts              위 전부를 내보낸다. 화면에서는 "@/lib/core/index.ts" 하나로 불러 쓴다
│  ├─ server/                  DB 읽기·쓰기 + 외부 API. 서버에서만 실행
│  │  ├─ auth.ts               공통: 로그인 확인 (요청마다 한 번)
│  │  ├─ dictionary.ts         공통: 활성 규칙 사전 읽기
│  │  ├─ openai.ts             공통: OpenAI 호출 (구조화 출력)
│  │  ├─ projects/             프로젝트 탭: projects.ts(조회·저장), records.ts(기록 저장: 버전 → 문장 → 태그), files.ts(파일 올리기) (README.md)
│  │  ├─ graph/                연결 그래프: 연결선 계산 · 조회
│  │  └─ gcam-import/          거캠 회고록 가져오기: import.ts(업로드→읽기→묶기→저장), ocr.ts, group.ts, draft.ts — 화면은 아직 (README.md)
│  └─ supabase/                공통: Supabase 연결 (서버용 클라이언트, 세션 갱신)
├─ tests/                      npm test 로 도는 단위 테스트 (core/ 계산 로직, gcam/ 거캠 칸 나누기, graph/ 그래프 배치)
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

서버 기능을 화면에 모두 붙였습니다.

| 기능 | 화면 | 서버 기능 · 설명 문서 |
|---|---|---|
| 파일 올리기 (PDF·DOCX·사진) | 자료 탭 "파일 올리기" · 자료 추가 창의 "파일" | `prepareFile` `addFile` · `lib/server/projects/README.md` |
| 원본 파일 보기 | 내용 보기 창의 "원본 파일", 사진은 미리보기 | `openFile` |
| 거캠 회고록 가져오기 | 프로젝트 관리 위쪽 버튼 · 프로젝트가 없을 때 화면 | `importActions.ts` · `lib/server/gcam-import/README.md` |
| 노트 옮기기 | 노트 ⋮ 메뉴 · 내용 보기 창의 "옮기기" | `moveRecord` |
| 연결 그래프 그림 | /graph | `latestRelations` |

## 아직 없는 것

- 회원가입 화면 (지금은 Supabase 대시보드에서 사용자를 만듭니다)
- 학과·직무 추천 화면 (점수표 수집 후)
- 태그 수정, 포트폴리오, 스크랩, 연결 노트, AI 호출 (개요는 직접 적기만 가능)

## 배포 (Vercel)

1. Vercel에서 저장소를 가져올 때 **Root Directory =** `Src`
2. Environment Variables에 `Src/.env.example`의 항목 등록
3. Supabase → Authentication → URL Configuration의 Site URL에 배포 주소 입력

### (Vercel 로그인 필요)

```bash
cd Src
vercel --prod
```