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
│  │  │  ├─ actions.ts         서버 액션 (프로젝트 · 기록 저장). { ok, message } 를 돌려준다
│  │  │  └─ [id]/page.tsx      프로젝트 관리 화면에 필요한 데이터를 한꺼번에 읽는다
│  │  └─ graph/                프로젝트 연결 목록
│  ├─ styles/prototype.css     프로토타입 스타일 원본 (직접 고치지 않는다)
│  └─ globals.css              프로토타입에 없는 화면용 추가 스타일
├─ components/
│  ├─ ui/                      Icon · Modal · Toast (어느 화면에서나 쓰는 것)
│  ├─ shell/                   Sidebar · Topbar
│  └─ projects/                프로젝트 관리 화면
│     ├─ ProjectsView.tsx      3단 구성의 뼈대 (목록 · 상세 탭 · 오른쪽 패널)
│     ├─ NoteList.tsx          자료 목록과 ⋮ 메뉴
│     ├─ NoteModal.tsx         내용 보기 · 본문 수정
│     ├─ AddNoteModal.tsx      링크 · 메모 추가
│     ├─ ProjectModal.tsx      새 프로젝트 · 수정 · 삭제
│     ├─ OverviewTab.tsx       개요 6항목
│     ├─ RightPanel.tsx        보완 제안 · 기록 확인 · 프로젝트 태그
│     └─ format.ts             날짜 · 종류 표시 형식
├─ lib/
│  ├─ core/                    계산 로직. DB·화면과 무관한 순수 함수 (lib/core/README.md)
│  ├─ server/                  DB 읽기·쓰기 + 저장 흐름. 서버에서만 실행
│  │  ├─ auth.ts               로그인 확인 (요청마다 한 번)
│  │  ├─ dictionary.ts         활성 규칙 사전 읽기
│  │  ├─ projects.ts           프로젝트 · 기록 · 개요 조회와 저장, 태그 병합
│  │  ├─ records.ts            기록 저장: 버전 → 문장 → 태그
│  │  └─ graph.ts              연결선 계산 · 조회
│  └─ supabase/                Supabase 연결 (서버용 클라이언트, 세션 갱신)
├─ proxy.ts                    모든 요청에서 로그인 확인
├─ vercel.json                 서버 위치를 서울(icn1)로 — Supabase 와 같은 지역
└─ prototype/                  중간 체크인 HTML 프로토타입 (디자인 기준)
```

**데이터가 흐르는 방향**: `components`(화면) → `actions.ts`(서버 액션) → `lib/server`(DB) → `lib/core`(계산).
화면에서 DB를 직접 부르지 않고 `lib/server`의 함수를 씁니다.

## 기록을 저장하면

`lib/server/records.ts`의 `createRecord`가 순서대로 실행합니다.

1. `records`에 기록 생성 (문장 ID에 쓸 번호 `no` 발급)
2. `record_versions`에 버전 1 저장 + 문장 분리
3. 규칙 사전으로 태깅 → `experiences`(source=rule)
4. 프로젝트 연결선 재계산 → `analysis_runs`(purpose=graph). 응답을 보낸 뒤에 실행 (`actions.ts`의 `after`)

본문을 고치면 `updateRecordText`가 해시를 비교해, 바뀌었을 때만 새 버전을 만듭니다.

## 아직 없는 것

- 회원가입 화면 (지금은 Supabase 대시보드에서 사용자를 만듭니다)
- 파일 업로드와 PDF·DOCX 글 추출
- 학과·직무 추천 화면 (점수표 수집 후)
- 태그 수정, 포트폴리오, 스크랩, 연결 노트, AI 호출 (개요는 직접 적기만 가능)
- 연결 그래프 그림 (지금은 목록)

## 배포 (Vercel)

1. Vercel에서 저장소를 가져올 때 **Root Directory = `Src`**
2. Environment Variables에 `.env.example`의 항목 등록
3. Supabase → Authentication → URL Configuration의 Site URL에 배포 주소 입력
