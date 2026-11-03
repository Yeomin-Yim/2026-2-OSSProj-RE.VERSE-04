# RE:Cord 프론트 피드백(10.29) 반영 — Claude Code 프롬프트 모음 (v2, 코드 대조 수정본)

> 사용법
> - **0단계**는 `CLAUDE.md`에 넣거나 첫 메시지로 전달한다.
> - **1~5단계**는 한 단계씩 순서대로 붙여넣는다. 단계가 끝날 때마다 브라우저로 직접 확인하고, `git commit` 후 다음 단계로 넘어간다.
> - 프롬프트 안의 줄 번호는 2026-11-01 기준 `Doc/RE-Cord-checkin.html`(2,510행)을 직접 확인해 적은 값이다. 이후 편집으로 밀릴 수 있으니 Claude Code가 작업 전에 다시 확인한다.
> - 포트폴리오/대체서식 레퍼런스는 이미 `Doc/ref/`에 2개 들어 있다. (4단계 참고)

## v1 → v2 변경 요약

| 구분 | v1 가정 | 실제 코드 (v2에서 반영) |
|---|---|---|
| 그래프 구조 | 루트 → 학교 → 프로젝트 | **루트 → 추천 전공/직무(`data[mode].children`) → 학교/조직(`nextMap`) → 말단(`leafProjects[mode]`)** 3단 드릴다운. 피드백 2는 이 중 전공 단계를 접는 작업이다. |
| 노트 기능 | 새로 만들어야 함 | **이미 있음.** `RC.state.graphNotes` + 그래프 아래 노트 패널(`#lmDock`, `nd-*` 액션, 자동 저장). 피드백 8은 이걸 재사용한다. |
| 노드 등장 모션 | 새로 만들어야 함 | `born[id]` + `animate(ms)` + `easeBack` 가 이미 있음(노트 추가 시 520ms 팝인). 생성 모션은 이걸 순차 호출하는 방식으로 확장한다. |
| 경고 문구 | 새로 만들어야 함 | 그래프 패널에 `SAMPLE_HINT`(`.panel-hint`), 프로젝트 화면에 `.badge-ai`("샘플 규칙") 가 산발적으로 있음. `RC.ui.notice`로 통일한다. |
| 대체서식 | 새로 만들어야 함 | **포트폴리오 3단계에 이미 있음**(`f.type === 'alt'`, `alt.rows` 10행, 활동내용 100자, 체크리스트 2개, 인쇄 미리보기). 단, 화면에 "서울대 2027" 이라고 적혀 있는데 실제 레퍼런스는 **동국대 2027** 이다. |
| "태그" (피드백 6) | 프로젝트 태그 | 프로젝트에는 `tags` 필드가 없다. 기록확인 화면의 **"기록 확인" 칩 7개**(`RC.ai.KEYS`: 기간·역할·문제·과정·결과·증빙·회고)가 피드백의 "태그"다. 현재는 클릭 불가 `<span class="chip">`. |
| 저장소 | `save()`만 호출 | `RC.store.load()`가 `localStorage['record-demo-v1']`을 읽고 `v !== 1`이면 시드로 교체. **새 상태 필드는 `load()`에서 마이그레이션**(graphNotes 예시처럼)해야 기존 저장 데이터가 안 날아간다. |
| 레퍼런스 | 4단계 전에 넣기 | `Doc/ref/`에 동국대 대체서식 PDF, 사람인 이력서 템플릿 PDF가 이미 있음. PDF 읽기 도구(pdftotext/pdftoppm)가 없어서 **PDFKit 스위프트 스니펫**으로 읽는다(4단계 참고). |

---

## 피드백 원문 (10.29)

1. 연결그래프 생성 중(고민 중) 화면 추가, 노드에서 노드가 생성되는 모션 보여주기
2. 연결그래프 첫 화면은 대학진학과 연결된 추천 학교 리스트만. 학교를 선택하면 연결된 프로젝트까지 보여주기
3. 중간발표 전까지 포트폴리오, 대체서식 만들어주는 것까지 프롬프팅 + 레퍼런스 넣어서 구현
4. "추천은 AI 기반 추천일 뿐…" 같은 안내 멘트
5. 직무는 추천직업 누르면 아래로 화면 이동하면서 채용공고 리스트 표시. 채용공고 스크랩, 메모 작성 가능
6. 프로젝트 기록확인에서 태그를 누르면 기간이면 기간 표시, 아니면 수정 가능
7. 다시 보고 싶은 대학/직무/채용공고 스크랩 → 메뉴에 스크랩 기능 추가
8. 노트 추가 기능은 최종노드에서 자유롭게 노트를 써서 스크랩할 때 함께 저장
9. 경고문구를 틈틈이 삽입 (AI 추천, 대체서식, 채용공고 등은 직접 한 번 더 확인)
10. 정보 밑에 해야 할 일 체크리스트 만들기

---

## 0단계: 프로젝트 컨텍스트 (CLAUDE.md 또는 첫 메시지)

```
# 프로젝트 컨텍스트
Doc/RE-Cord-checkin.html 은 RE:Cord 중간 체크인 프로토타입이다.
단일 HTML 파일(CSS+JS 인라인, 약 2,500행), 해시 라우팅 SPA, 한국어 UI.
브랜치: checkin-prototype. 커밋은 단계별로 하나씩.

## 구조 (2026-11-01 기준 줄 번호, 수정 전 반드시 grep 으로 다시 확인할 것)
- CSS 토큰 :root (10~20행): --bg --card --line --primary --lav --lav-line --accent --text --sub --hint
  --chip-off --danger --ok --graph --radius --shadow --font. 임시 무채색, 브랜드 컬러는 미정.
- CDN: Pretendard(7행), force-graph@1.43.5(449행). 그 외 외부 라이브러리 없음.
- 전역 네임스페이스 RC (window.RC). 각 <script> 블록이 (function (RC) { ... })(window.RC) 로 기능을 붙인다.
  · 500~563행  RC.u (esc, uid, ym, ymd, period, noteDate, sleep …), RC.store
      - localStorage 키 'record-demo-v1'. load(): 저장값이 없거나 v !== 1 이면 RC.seed() 사용.
        새 필드는 load() 안에서 "없으면 기본값" 으로 마이그레이션한다 (graphNotes 가 그 예시).
      - save(), reset(), project(id), exp(id), expsOf(pid), mainExp(pid), onChange(fn), emit()
        (emit = save + 리스너 호출. 뷰를 다시 그려야 하는 변경은 emit, 조용한 저장은 save).
  · 564~765행  RC.ai (목업 규칙 엔진) — KEYS/LABEL(기록확인 7항목), analyzeSync, suggestSync,
      findRelations, extractExperience, generateDraft/draftSync, refineText. 전부 setTimeout 지연 + 규칙 기반.
  · 766~872행  RC.seed() — 샘플 상태. projects(p1~p3: id, name, shortName, topic, dates{start,end},
      status, notes[], experience{role, activity, problem, process, result, reflection, interests[], draft},
      expDraft, analysis), experiences(e1~e5, tags[]), relations, interests, pattern,
      portfolio{type:'project'|'alt', selected, order, drafts, alt{rows, checklist}, built}, graphNotes, ui.
  · 450~498행  RC.icon(name, cls) 아이콘 SVG 사전(bell bulb check chevD chevR eye file graph home info plus refresh search target trash x — star 는 없음), RC.logo
  · 873~981행  공통 UI — RC.toast(msg), RC.viewNote(n), RC.closeMenus, RC.go(hash)
  · 983~1380행 RC.views.projects — 탭: 자료/연결 노트/개요/진행 기록/결과.
      오른쪽 컬럼 rightHtml(p) 에 "보완 제안" + "기록 확인" 칩(chipsHtml, RC.ai.KEYS 7개, 클릭 불가).
  · 1382~2109행 RC.views.learning (연결 그래프, #/learning)
      - 샘플 데이터는 이 블록 안의 지역 변수: student, data{college,career}{root,children}, nextMap(전공/직무 id →
        학교/조직 배열, kind:'target'), leafProjects{college,career}(kind:'project'|'info'), PID(제목→프로젝트 id).
      - 상태 state() = RC.state.ui.career { mode:'college'|'career'|null, path:[nodeId], sel }.
        chooseMode / reset / back / selectNode 가 path 를 조작하고 render() 가 그래프를 다시 그린다.
      - 노드 종류 kind: root → recommend(전공/직무) → target(학교/조직) → project | info. 노트 노드 kind:'note'.
      - evidencePids(node): 노드와 연결된 실제 프로젝트 id 목록 (node.evidence 제목 + PID 매핑). 학교별 연결 프로젝트는 이걸 쓴다.
      - DOM: #lmDecision(모드 선택 화면, showDecision), #lmPanel(오른쪽 패널, updatePanel/updatePanelProject/updatePanelNote),
        #lmDock(그래프 아래 노트 편집 패널, openNote/openProject/closeDock, nd-title/nd-body 자동 저장), SAMPLE_HINT.
      - 모션: born[nodeId] = Date.now() 후 animate(ms) 를 부르면 easeBack 으로 520ms 팝인(1667행, 2002행 참고).
  · 2111~2364행 RC.views.portfolio (#/portfolio/1~3 위저드: 유형 선택 → 경험 선택 → 초안 편집)
      - SECS = problem/role/result 3섹션, 500자, RC.ai.generateDraft / refineText 사용.
      - f.type === 'alt' 이면 3단계가 대체서식 표(step3Alt): alt.rows[{pid,name,period,content,org}] 최대 10행,
        활동내용 100자 카운터, 체크리스트 2개(alt.checklist), 인쇄 미리보기(preview). 제목이 "서울대 2027 수시 참고" 로 되어 있음.
  · 2366~2508행 앱 셸 — route() (2373행: projects/learning/portfolio/coach), renderSidebar 의 items 배열(2383행:
      프로젝트 관리 #/projects, 연결 그래프 #/learning, 포트폴리오 만들기 #/portfolio/1), 검색, boot().
- 이벤트 패턴: 뷰 객체 V = { acts:{}, ins:{}, mount(el, route), destroy? }.
  data-act="x" 클릭 → V.acts.x(el, e) / data-in="x" input·change → V.ins.x(el, e) / data-focus → V.ins.x.
  RC.views.xxx = V 로 등록, 라우터가 RC.cur = V 로 잡는다.

## 작업 규칙
1. 파일 구조(단일 HTML, RC 네임스페이스, RC.views.xxx 등록 방식, (function(RC){})(window.RC) 블록)를 유지한다.
2. 새 기능은 기존 코드 스타일(ES5 function, 문자열 템플릿 렌더, V.acts/V.ins 패턴, esc() 이스케이프)을 따른다.
3. 색상은 :root 토큰만 사용한다. 새 색상 하드코딩 금지. (그래프 블록의 colors/ACCENT 는 기존 값 유지)
4. 새 외부 라이브러리 추가 금지. (기존 CDN: Pretendard, force-graph 만)
5. 상태 변경 후에는 RC.store.save() 또는 emit() 으로 저장하고 해당 뷰를 다시 렌더한다.
   RC.state 에 새 필드를 추가할 때는 RC.seed() 와 RC.store.load() 마이그레이션 두 곳에 모두 넣는다.
6. 실제 서버/DB/AI API는 없다. 모든 데이터는 MVP용 목업(샘플 데이터)이다.
   - 채용공고: DB 미연결 상태이므로 예시 채용공고를 코드 내 상수로 만든다.
   - 학교·직업·AI 추천 결과도 동일하게 샘플 데이터로 처리한다.
   - 모든 목업 데이터는 한 곳(RC.mock = { postings, schools, jobs, ... })에 모아서,
     나중에 DB/API 호출로 교체할 때 이 객체만 바꾸면 되도록 만든다.
     (현재 learning 블록 안에 지역 변수로 흩어진 data/nextMap/leafProjects 도 2단계에서 RC.mock 으로 옮긴다.)
   - 화면에서 목업이 실제 데이터로 오해되지 않도록 "예시 데이터" 표시를 작게 붙인다.
7. 한 번에 한 단계만 구현하고, 끝나면 변경 요약 + 수동 테스트 방법을 알려준다.
8. 모호한 부분은 임의로 넓게 해석하지 말고, 가정을 먼저 한두 줄로 적은 뒤 진행한다.
9. 기존 동작(프로젝트 CRUD, 자료 업로드, 검색, 그래프 노드 클릭 → 프로젝트 이동, 그래프 노트 편집,
   포트폴리오 초안 생성/인쇄)을 깨뜨리지 않는다.
10. 포트폴리오/대체서식은 사용자가 직접 찾은 레퍼런스(Doc/ref 폴더 또는 대화에 붙여넣은 자료)를
    기준으로 만든다. 레퍼런스가 있으면 구조·항목·톤을 그대로 따르고, 임의로 새 양식을 창작하지 않는다.
    레퍼런스가 부족하면 만들기 전에 어떤 레퍼런스가 더 필요한지 먼저 물어본다.
11. 이 환경에는 pdftotext / pdftoppm 이 없다. PDF 레퍼런스는 아래 PDFKit 스니펫으로 텍스트를 뽑아 읽는다.
    (스니펫 파일은 /tmp 처럼 Doc/ref 밖에 둔다.)
      cat > /tmp/pdftext.swift <<'EOF'
      import Foundation
      import PDFKit
      for path in CommandLine.arguments.dropFirst() {
        guard let doc = PDFDocument(url: URL(fileURLWithPath: path)) else { print("== FAIL \(path)"); continue }
        print("== \(path) pages=\(doc.pageCount)")
        for i in 0..<doc.pageCount { print("--- page \(i+1)"); print(doc.page(at: i)?.string ?? "") }
      }
      EOF
      swift /tmp/pdftext.swift Doc/ref/*.pdf
```

---

## 1단계: 공통 기반 (경고문구 + 스크랩 저장소 + 목업 접근층)

> 이후 모든 기능이 이 컴포넌트를 쓰기 때문에 가장 먼저 만든다.
> 새 <script> 블록 하나를 RC.store 블록(563행 `</script>`) 바로 뒤, RC.ai 블록 앞에 추가하는 것을 권장한다.
> (RC.ui 는 RC.icon 을 쓰므로 RC.ui.notice/scrapBtn 은 함수 호출 시점에 RC.icon 을 참조하게 만들면 블록 순서와 무관하다.)

```
[1단계] 공통 기반 컴포넌트를 먼저 만든다. 구현 전에 RC.store(500~563행)와 RC.seed(766행 이후)를 읽는다.

A. 경고 배너 컴포넌트 RC.ui.notice(type, extraText?)  → HTML 문자열 반환
 - type: 'ai'      → "AI 기반 추천일 뿐이며, 실제 결정 전 반드시 직접 확인하세요."
         'form'    → "대체서식은 참고용입니다. 제출 전 해당 대학의 공식 서식·유의사항을 직접 확인하세요."
         'job'     → "채용공고 정보는 변경·마감될 수 있습니다. 지원 전 원문 공고를 직접 확인하세요."
         'school'  → "학교 정보는 최신 모집요강을 직접 확인하세요."
         'mock'    → "예시 데이터입니다. 실제 정보가 아니에요."  (목업 표시용, 가장 작게)
 - 무채색 톤의 작은 안내 박스(RC.icon('info') + 한 줄). 닫기 버튼 없이 항상 표시. CSS 클래스 .notice .notice-{type}.
 - 스타일은 기존 .panel-hint / .badge-ai 와 톤을 맞춘다. 기존 SAMPLE_HINT(1869행)는 2단계에서 RC.ui.notice('ai') 로 교체한다.

B. 스크랩 저장소 RC.store.scraps
 - RC.state.scraps = [{ id, type:'school'|'job'|'posting'|'node', refId, title, meta, memo, note, noteId, createdAt }]
   · memo: 스크랩 카드에서 쓰는 짧은 메모 / note: 최종 노드에서 쓴 자유 노트 본문 스냅샷 / noteId: 연결된 graphNotes id(있으면)
 - 메서드: add(item), remove(id), toggle(type, refId, item), get(type, refId), isScrapped(type, refId),
   updateMemo(id, text), updateNote(id, text), list(type?)
 - RC.seed() 에 scraps: [] 추가 + RC.store.load() 에 `if (!Array.isArray(s.scraps)) s.scraps = [];` 마이그레이션 추가.
   (graphNotes 마이그레이션 바로 아래.) 이미 localStorage 에 저장된 상태로 새로고침해도 에러 없이 빈 배열이 생겨야 한다.
 - 변경 후 RC.store.save() 호출. 스크랩 수 변화를 사이드바 배지에 쓰고 싶으면 emit() 을 쓴다.

C. 스크랩 토글 버튼 RC.ui.scrapBtn(type, refId, item) → HTML 문자열
 - data-act="scrap-toggle" data-type data-ref 를 가진 <button class="scrap-btn [on]">. 아이콘은 RC.icon 에 'star' 가 없으면 추가.
 - 각 뷰의 V.acts['scrap-toggle'] 이 RC.store.scraps.toggle(...) 을 부르고 자기 화면을 다시 그린다.
   (공통 핸들러를 RC.ui.bindScrap(V) 같은 헬퍼로 묶어도 좋다.)

D. 목업 데이터 저장소 RC.mock 과 데이터 접근 함수 RC.api 의 뼈대
 - RC.mock = { postings: [], schools: [], jobs: [], majors: [] } (내용은 2단계에서 채움)
 - RC.api.getPostings(jobId), getSchools(majorId?), getJobs(), getMajors() 는 지금은 RC.mock 을 동기 반환한다.
   (나중에 fetch 로 바꿀 때 화면 코드를 안 고치도록, 호출부는 반환값을 바로 쓰되 Promise 로 바꿔도 되게 한 줄로 감싼다.)

완료 후: 브라우저 콘솔에서 RC.ui.notice('ai'), RC.store.scraps.add({type:'school', refId:'hongik', title:'홍익대'}),
RC.store.scraps.isScrapped('school','hongik'), 새로고침 후 RC.state.scraps 확인 — 이 순서로 테스트 방법을 알려줘.
```

---

## 2단계: 연결 그래프 개편 (가장 큰 작업)

> 현재 그래프는 "루트 → 추천 전공/직무 → 학교/조직 → 프로젝트·준비정보" 3단 드릴다운이다.
> 피드백 2는 대학진학 모드에서 **전공 단계를 접고 학교를 바로** 보여달라는 것이고,
> 피드백 5는 직무 모드에서 **조직 단계 대신 채용공고 리스트**를 보여달라는 것이다.

```
[2단계] 연결 그래프(#/learning, 1382~2109행)를 개편한다. 아래 요구사항을 모두 만족해야 한다.

구현 전에 현재 그래프 코드(data, nextMap, leafProjects, PID, evidencePids, state(), chooseMode/selectNode/render,
updatePanel, born/animate, openNote/openProject/closeDock)를 먼저 읽고,
수정할 함수 목록과 계획을 7줄 이내로 알려준 뒤 진행해줘.

0. 데이터 이동
 - learning 블록 안의 data.college.children(전공), nextMap(학교/조직), leafProjects 를 RC.mock.majors / RC.mock.schools /
   RC.mock.jobs / RC.mock.orgs 로 옮기고, 그래프 코드는 RC.api 를 통해서만 읽는다. 노드 id·label·evidence 값은 그대로 유지한다.
 - 학교 데이터에 majorId(어느 추천 전공에서 왔는지)를 넣는다. 기존 nextMap 키가 그 값이다.

1. 첫 화면 (대학진학 모드)
 - 루트("대학 진학") 바로 아래에 "추천 학교 리스트"만 보여준다. (전공 노드와 프로젝트 노드는 숨김)
   · 학교 노드의 sub 에 전공명을 넣어 어느 전공 추천인지 보이게 한다. 같은 학교가 전공별로 중복(hongik, hongik-urban)이면 둘 다 둔다.
 - 학교 노드를 선택하면(selectNode → path 에 push) 그 학교와 연결된 프로젝트 노드만 펼친다.
   연결 프로젝트는 evidencePids(schoolNode) 결과(실제 RC.state.projects id)로 만든다. leafProjects 의 info 노드는
   그래프에 그리지 않고 오른쪽 패널(#lmPanel)의 "준비 정보" 목록으로만 보여준다.
 - 학교를 다시 선택 해제(back)하거나 다른 학교를 선택하면 이전 학교의 프로젝트는 접는다. (path 는 항상 [schoolId] 하나만)
 - 패널의 학교 목록 위에 RC.ui.notice('school') 를 표시한다.
 - 기존 "프로젝트 노드 클릭 → openProject → 프로젝트 관리 이동(lm-goproj)" 동작은 유지한다.

2. "생성 중(고민 중)" 화면 + 생성 모션
 - chooseMode(mode) 직후, 그리고 "다시 생성" 버튼을 눌렀을 때 그래프 영역 위에 로딩 오버레이를 먼저 보여준다.
   예: "AI가 프로젝트 기록을 분석하며 연결을 고민하고 있어요…" + 진행 단계 문구 3개 순환
   ("프로젝트 기록 읽는 중", "관심 키워드 묶는 중", "학교·직무와 연결하는 중"), 약 1.5초.
 - 이후 루트 노드 하나에서 시작해 자식 노드가 하나씩 가지를 뻗으며 나타나는 모션을 넣는다.
   · 기존 born[id] + animate(ms) 팝인을 재사용한다: 노드를 한 번에 다 넣지 말고 setTimeout 으로 120~180ms 간격으로
     graph.graphData() 에 노드·링크를 순차 추가하며 born[id] = Date.now() 를 찍는다. 총 2~4초.
   · 모션 중에는 노드 클릭을 막고, 끝나면 일반 인터랙션으로 전환. 모션 중 모드/메뉴 전환이 일어나면 타이머를 전부 정리한다(destroy).
 - 그래프 상단에 "다시 보기" 버튼(V.acts['lm-replay'])으로 모션 재생 가능.
 - 한 번 본 뒤 같은 세션에서 모드를 다시 들어올 때는 로딩을 건너뛰고 바로 그린다. (RC.state.ui.career.seen[mode] = true)

3. 직무 모드 (채용공고는 MVP 예시 화면)
 - 루트("취업·직무") 아래에 추천 직무 노드(기존 data.career.children 4개)를 보여준다. 조직(nextMap) 단계는 쓰지 않는다.
 - 채용공고는 RC.mock.postings 에 예시 데이터로 만든다.
   · 직무 4개 각각 채용공고 3~5개
   · 필드: id, jobId, company, title, location, deadline, requirements[], preferred[], summary, url('#'),
     checklist[] (4단계에서 사용, 지금은 빈 배열)
   · 회사명은 실제 기업명 대신 가상 이름 사용 (예: "예시테크", "샘플랩")
 - 추천 직무 노드를 클릭하면 그래프 아래 새 섹션 #lmPostings 에 해당 직무의 채용공고 리스트를 그리고
   scrollIntoView({behavior:'smooth'}) 로 내려간다. (기존 #lmDock 과 별개 영역. 노트 패널과 동시에 열려도 되게 한다.)
 - 리스트 상단에 RC.ui.notice('mock') 와 RC.ui.notice('job') 를 표시한다.
 - 각 채용공고 행: 회사·제목·지역·마감 + 펼치면 요건/우대/요약 + RC.ui.scrapBtn('posting', id) +
   메모 textarea(data-in="posting-memo", 입력 시 디바운스 저장 → RC.store.scraps.updateMemo; 스크랩 전이면 스크랩 생성 후 저장).
 - 데이터 접근은 반드시 RC.api.getPostings(jobId) 를 거친다.
 - 그래프에서 채용공고를 말단 노드로도 보여주고 싶으면 직무 노드 선택 시 공고 노드(kind:'posting')를 펼친다. 필수는 아니다.

4. 최종 노드 노트 (피드백 8)
 - 최종 노드 = 학교 → 프로젝트 말단, 직무 → 채용공고 말단.
 - 프로젝트 말단은 기존 openProject(pid) + "노트 추가"(lm-add → graphNotes) 흐름을 그대로 쓴다. 새 노트 시스템을 만들지 않는다.
 - 채용공고 말단은 3번의 메모 textarea 가 노트 역할을 한다.
 - 그 상태에서 스크랩하면: 프로젝트/학교 스크랩은 현재 열려 있는 graphNote 의 body 를 note 필드에, id 를 noteId 에 함께 저장.
   채용공고 스크랩은 memo 를 그대로 저장.
 - 스크랩된 학교/직무 노드는 그래프에서 작은 별 표시(nodeCanvasObject 안에서 그린다).

5. 경고 배너
 - #lmPanel 의 추천(recommend)·학교(target) 영역 상단에 RC.ui.notice('ai'), 기존 SAMPLE_HINT 는 notice('mock') 로 교체.

완료 후: (1) 바뀐 상태 구조(ui.career)가 기존 저장값과 호환되는지, (2) 모션 타이머 정리 위치, (3) 수동 테스트 순서를 알려줘.
```

---

## 3단계: 스크랩 메뉴 + 프로젝트 "기록 확인" 칩 동작

```
[3단계] 스크랩 메뉴와 프로젝트 기록확인 칩 동작을 구현한다.

A. 스크랩 메뉴 (새 라우트 #/scraps)
 - route()(2373행)에 top === 'scraps' 분기를, renderSidebar 의 items 배열(2383행)에
   ['scraps', '#/scraps', 'star', '스크랩'] 을 추가한다. (RC.icon 에 'star' 가 없으면 추가)
 - 새 <script> 블록에 RC.views.scraps = V 를 만든다. (portfolio 블록 뒤, 앱 셸 블록 앞)
 - 화면: 탭 필터(전체 / 대학 / 직무 / 채용공고 / 노드 노트) + 카드 리스트. 최신순.
 - 각 카드: 제목, 메타(전공·회사·마감 등), 메모 textarea(자동 저장), 노트 본문(있으면), 스크랩 해제 버튼,
   "원래 위치로 이동" 버튼 → RC.state.ui.career 를 { mode, path:[...], sel } 로 세팅하고 RC.go('#/learning').
   채용공고면 #/learning 이동 후 해당 직무의 #lmPostings 로 스크롤까지.
 - 비어 있을 때 안내 문구(빈 상태 화면): "그래프에서 별을 누르면 여기에 모여요."

B. 프로젝트 기록확인 화면의 "기록 확인" 칩 (피드백 6)
 - 대상은 rightHtml(p) → chipsHtml(p)(996행) 의 7개 칩이다 (RC.ai.KEYS: period/role/problem/process/result/proof/reflection).
   현재는 클릭 불가 <span>. <button class="chip" data-act="chip" data-key="…"> 로 바꾼다.
 - 가정: 칩의 값은 아래 필드에서 온다 (확인 후 다르면 알려줘).
   · period     → p.dates.start / p.dates.end   (표시 전용)
   · role/problem/process/result/reflection → p.experience[key] (개요 탭의 FIELDS 와 같은 필드)
   · proof      → p.notes 중 tag === 'result' 인 자료 (파생값, 직접 수정 불가)
 - 동작:
   · period 칩 클릭 → 칩 아래에 "2026.03.02 ~ 2026.05.29" 팝오버 표시. 기간 미입력이면 "기간 입력하기" 버튼으로 기존 edit-project 흐름 연결.
   · role 등 5개 → 칩 아래 인라인 input/textarea 로 전환. Enter 저장(p.experience[key] 갱신 → p.analysis = RC.ai.analyzeSync(p)
     → RC.store.emit() → 칩 다시 그림), Esc 취소. 개요 탭이 열려 있으면 같이 갱신된다.
     p.experience 가 null(p3처럼 아직 정리 전)이면 빈 experience 객체를 만든 뒤 저장한다.
   · proof 칩 클릭 → 자료 탭으로 이동(tab = 'files') + "결과물로 표시" 안내 토스트.
 - 기존 "보완 제안" 가이드 동작과 shimmer/pop 애니메이션 클래스는 유지한다.
```

---

## 4단계: 체크리스트 + 포트폴리오/대체서식

> **레퍼런스 현황 (`Doc/ref/`, 2026-11-01 확인):**
>
> | 파일 | 종류 | 핵심 구조 |
> |---|---|---|
> | `4_1. 학생부종합전형_학교생활기록부 대체 서식(…).pdf` | **동국대 2027 수시 학생부 대체서식** (3쪽) | 1쪽 전형명·모집단위·성명·수험번호·학력정보 + 작성 유의사항 ①~⑦ / 2쪽 유의사항 ⑧~⑫(기재금지 항목) + 지원자 확인 서약 / 3쪽 **증빙자료 목록표**: 연번·①활동명·②활동기간(년월일~년월일)·③활동내용(100자 이내, 기관명 기재 금지, 객관적 사실만)·④활동(발행)기관·⑤해당 페이지. 5행 기본, 연번 추가 가능. 증빙자료 A4 단면 10매 이내. |
> | `resume_download_4106.pdf` | **사람인 이력서 템플릿** (디자이너용, 3쪽) | 1쪽 인적사항(이름·생년월일·연락처·이메일·주소·포트폴리오/SNS 링크), 학력(학교·전공·기간), 수상, 자격증, 스킬, 경력(직장·부서·직급·기간), **주요 프로젝트 및 실적**(기간 + 내용서술 ×3) / 2쪽 자기소개서(한 줄 슬로건, 지원동기, 입사 후 포부) / 3쪽 자유서술. |
>
> 기존 코드의 대체서식 화면은 이미 동국대 표와 거의 같다(활동명·활동기간·활동내용 100자·활동기관). 빠진 것은 **"해당 페이지" 열**, **5행 기본·연번 추가**, **유의사항 요약**, 그리고 제목이 "서울대 2027"로 잘못 적힌 부분이다.

```
[4단계] 체크리스트와 포트폴리오·대체서식 기능을 구현한다.

A. 해야 할 일 체크리스트 (피드백 10)
 - 정보가 표시되는 화면 하단에 "해야 할 일" 섹션을 추가한다:
   · 연결 그래프 #lmPanel 의 학교 노드 / 직무 노드 / 채용공고 행(펼친 상태) / 프로젝트 관리 개요 탭 하단 / 스크랩 카드.
 - RC.state.todos = { [scopeKey]: [{ id, text, done, createdAt }] }, scopeKey = 'school:hongik' | 'posting:pst-1' | 'project:p1' 처럼
   type:refId. RC.seed() 와 RC.store.load() 마이그레이션 둘 다 추가.
 - 항목 추가/삭제/체크/체크 해제, 진행률(예: 2/5) 표시. 공통 렌더 헬퍼 RC.ui.todoList(scopeKey) + 공통 액션(todo-add/todo-toggle/todo-del).
 - RC.mock.schools / RC.mock.postings 의 각 항목에 defaultChecklist[] 를 두고(예: 모집요강 확인, 제출 서류 준비, 마감일 캘린더 등록 /
   공고 원문 확인, 포트폴리오 링크 준비, 지원서 제출), 그 scopeKey 의 todos 가 아직 없을 때 처음 열면 기본 항목으로 채운다.

B. 포트폴리오 / 대체서식 생성 (#/portfolio/…)

[레퍼런스 처리 방식]
 - 작업 시작 시 먼저 0단계의 PDFKit 스니펫으로 Doc/ref/*.pdf 텍스트를 뽑아 읽고, 레퍼런스별로 아래를 정리해 보고한다:
   · 서식 종류 (포트폴리오 / 학교 제출용 대체서식 / 이력서 / 기타)
   · 섹션 구조와 순서, 각 섹션의 항목명, 글자수·행수 제한
   · 분량·문체·톤, 필수 입력 항목, 기재 금지 항목(대체서식)
 - 이 분석 보고에서 내 확인을 받은 뒤에 구현을 시작한다.
 - 레퍼런스가 없거나 부족하면 임의로 만들지 말고 "어떤 레퍼런스가 필요한지"를 먼저 질문한다.
   (예: 고등학생용 포트폴리오 레퍼런스는 아직 없다. 기존 SECS 3섹션이 유일한 근거이므로 그대로 유지하고 그 사실을 보고에 적는다.)

[구현]
 - 템플릿 정의를 코드 상수로 만든다:
   RC.templates = { [id]: { name, type:'portfolio'|'altform'|'resume', ref:'파일명', notice:'form'|'ai',
                            sections:[{ key, label, prompt, sourceFields, limit?, kind:'text'|'table' , columns? }] } }
   · 'portfolio-project' : 기존 SECS(problem/role/result, 500자) 를 그대로 옮긴다. 레퍼런스 없음 → 보고에 명시.
   · 'altform-dongguk-2027' : 동국대 증빙자료 목록표. kind:'table', columns = 활동명/활동기간/활동내용(100자)/활동(발행)기관/해당 페이지,
     기본 5행·최대 10행, 상단에 유의사항 요약(기관명 기재 금지, 교외 수상·공인어학 기재 금지, 증빙 10매) + 체크리스트.
     기존 step3Alt / alt.rows / preview 를 이 템플릿 기반으로 바꾸고 "서울대 2027" 문구를 "동국대 2027 수시 참고" 로 고친다.
     alt.rows 에 page 필드를 추가한다(기존 저장값은 ''로 마이그레이션).
   · 'resume-saramin' : 사람인 템플릿 중 고등학생에게 해당하는 부분만 — 인적사항(이름만, 나머지 빈칸), 학력, 스킬(experience.interests·tags),
     주요 프로젝트 및 실적(프로젝트당 기간 + 내용서술), 자기소개서(한 줄 슬로건 / 지원동기 / 입사 후 포부). 수상·자격증·경력은 빈 칸으로 두고 사용자 입력.
   · prompt: 해당 섹션을 채울 때 AI에게 줄 지시문 (레퍼런스의 구조·문체·글자수 제한을 따르라는 내용 포함)
   · sourceFields: 프로젝트 기록의 어떤 필드(name, dates, topic, experience.problem/process/result/reflection/interests, notes[].text)를 입력으로 쓸지
 - #/portfolio/1 유형 선택을 RC.templates 목록으로 바꾼다 (type 별 설명 + 레퍼런스 출처 표시). RC.state.portfolio.type 은 templateId 를 저장.
   기존 저장값 'project' → 'portfolio-project', 'alt' → 'altform-dongguk-2027' 로 load() 에서 마이그레이션.
 - RC.ai.generateDocument(project, templateId) → { [sectionKey]: text | rows[] } 를 섹션별 목업으로 생성.
   기존 draftSync / altSentence 로직을 이 안으로 옮기고, 각 섹션의 완성된 prompt 문자열을 결과에 같이 담아
   "프롬프트 보기" 토글(V.acts['show-prompt'])과 console.debug 로 확인할 수 있게 한다. 나중에 이 함수 하나만 실제 LLM 호출로 교체한다.
 - 생성 결과는 섹션별로 직접 수정할 수 있게 하고(기존 초안 편집 UI 재사용), 수정 내용은 RC.state.portfolio.drafts 에 저장한다.
 - 새 레퍼런스가 생겨도 RC.templates 에 항목만 추가하면 되는 구조로 만든다.
 - 결과 화면 경고 배너: altform/resume → RC.ui.notice('form'), AI 생성 섹션 → RC.ui.notice('ai'). 인쇄 미리보기에도 작게 넣는다.

[보고]
 구현 후 (1) 어떤 레퍼런스를 어떤 템플릿으로 옮겼는지, (2) 레퍼런스에 없어서 임의로 채운 부분이 있는지,
 (3) 목업인 부분과 실제 로직인 부분을 구분해서 알려줘.
```

---

## 5단계: 전체 점검

```
[5단계] 전체 점검을 한다.
1. 피드백 10개 항목을 체크리스트로 하나씩 대조해서 표로 보고해줘. (구현됨 / 부분 / 미구현 + 근거 함수명)
2. 경고 배너가 들어가야 할 모든 화면(AI 추천, 대체서식·이력서, 채용공고, 학교 정보, 스크랩 카드, 인쇄 미리보기)에
   빠짐없이 들어갔는지 grep "RC.ui.notice(" 로 확인한다.
3. 새로고침 후에도 스크랩·메모·노트·체크리스트·포트폴리오 초안이 유지되는지 확인한다.
   추가로, 1단계 이전에 저장된 localStorage 값(scraps/todos 없음, portfolio.type 'alt')을 흉내 내어
   RC.store.load() 마이그레이션이 에러 없이 통과하는지 콘솔에서 확인한다.
4. 기존 기능(프로젝트 생성/삭제, 자료 업로드, 검색, 그래프 노드 클릭 → 프로젝트 이동, 그래프 노트 편집·삭제,
   포트폴리오 초안 생성·다듬기·인쇄)이 깨지지 않았는지 확인한다.
5. 목업 데이터가 전부 RC.mock / RC.api 를 거치는지 확인한다. learning 블록 안에 남은 지역 샘플 데이터가 없어야 한다.
6. 모션 타이머(setTimeout)가 destroy() 에서 전부 정리되는지, 모드 전환을 빠르게 반복해도 콘솔 에러가 없는지 점검한다.
7. 콘솔 에러·경고가 없는지 점검한다.
```

---

## 참고

- **"최종노드"**는 그래프 말단(학교→프로젝트, 직무→채용공고)으로 해석했다. 노트는 기존 graphNotes 를 재사용한다.
- **"대체서식"**은 학교생활기록부 대체서식(동국대 2027 레퍼런스 기준)으로 해석했다. 이력서(사람인)는 직무 모드용 별도 템플릿이다.
- **"태그"**(피드백 6)는 프로젝트 관리 오른쪽 "기록 확인" 칩 7개로 해석했다. 팀 의도가 "연결 노트 탭"이나 "경험 tags"라면 3단계 B 를 바꾼다.
- 학교 샘플 데이터는 실제 대학명(홍익대·국민대 등)을 쓰고 있다. 발표 전에 가상 이름으로 바꿀지 팀에서 정한다. ('school' 배너는 그 전까지의 안전장치)
- 팀에서 생각하는 의미가 다르면 해당 단계 프롬프트의 문구를 수정해서 쓴다.
- 꼬이면 단계별 `git commit` 지점으로 되돌린다.
