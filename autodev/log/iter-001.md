# 반복 #001 (2026-11-27)

## 고른 작업
처음엔 T00(대조표) + T08c(문장 다듬기)를 하려 했으나, 조사 중 원격 DB의 `major_profiles`·`job_profiles`·`universities`가 0행인 것을 발견 → 진로 탐색(시연 흐름의 핵심)이 실제 계정에서 항상 "준비 중"으로 끊겨 있었다. T05(점수표 시드)로 바꿨다. T00은 조사 결과로 첫 판만 작성.

## 결정
- D003 점수표를 profiles.csv 초안으로 채움 (확인됨)

## 바꾼 파일
- `supabase/seed/build_profiles.ts`: `--apply`(service role REST upsert, 의존성 없이 fetch), 빈 태그 줄 건너뛰기
- `autodev/DECISIONS.md`, `autodev/PARITY.md`(새), `autodev/TASKS.md`, `autodev/shots/001-graph-career.png`
- DB: major_profiles 9행, job_profiles 10행 (profile_version 2026-11-23-draft-0.3)
- 커밋하지 않은 도구: `zz_local/autodev/shot.mjs`(Playwright 로그인+스크린샷), `check_explore.ts`

## 검증
- npm test 49/49 통과, tsc 0, build 통과
- 실제 화면: 취업 → 추천 직무 5개 (shots/001-graph-career.png)
- "대학 진학" 클릭 스크린샷은 locator 클릭 타임아웃(저장된 위치가 이미 취업 모드라 원 선택 화면이 아니었던 것으로 보임) → 학과 쪽은 계산 스크립트로만 확인

## 자기 검토
- GOAL 진척: ② "진학/취업 선택 → 학과/직무 후보 → 근거 프로젝트"가 실제 데이터로 처음 동작. 데이터 "점수표 시드" 절반(대학 목록 남음).
- 서비스 원칙: 평가 금지 — 화면에 "합격·취업 가능성이 아니에요" 있음. 다만 점수표가 검수 전 초안인데 화면이 그걸 말하지 않음(T05c). 미구현을 완료처럼 — 문장 다듬기는 지금 정직하게 "AI 미연결"로 비활성이라 위반 아님.
- 예측 vs 결과: 일치 (9/10행, 추천 나옴, 테스트 통과).
- 깐깐한 리뷰어의 첫 질문: "검수 안 된 초안 점수표를 운영 DB에 넣어도 되나?" → D003 이유/포기한 것에 답. 버전 문자열로 나중 검수본이 자동 우선.
  두 번째: "--apply 의 DELETE+POST 가 트랜잭션이 아닌데?" → 대학 목록 경로에만 해당, POST 실패 시 그 학과 목록이 빈다. 재실행으로 복구 가능, 이번엔 대학 0건이라 실행 안 됨. T05b에서 다시 볼 것.
- 학생이 멈칫할 곳: 환경·지역 프로젝트가 많은 김서윤에게 1위가 컴퓨터공학과 — "왜?"가 생긴다. 점수표가 IT 위주라는 설명 필요(T05c).

## 다음 반복에게
- **주의: 이 작업 트리를 다른 작업자(사람 또는 다른 에이전트)가 동시에 고치고 있다.** 이번 반복 중에 `Src/lib/**/keywords/*`, `scripts/build_keyword_profiles.ts`, `tests/keywords/keywords.test.ts`, `Src/AGENTS.md`가 바뀌었다(내가 안 건드림). 이번 커밋에는 넣지 않았다. `git add -A` 대신 내 파일만 add 할 것.
- 1순위 T08c(문장 다듬기). 그다음 T05c(초안 표시, 작음), T05b(대학 목록).
- 화면 확인 방법은 PARITY.md 아래 "환경 메모".
