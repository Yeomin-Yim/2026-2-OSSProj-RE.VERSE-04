# RE:Cord DB (Supabase)

기준: 중간발표 p38 + `local/wireframe.md` 3.1. 충돌하면 중간발표를 따른다.

## 적용 방법

Supabase 대시보드 → **SQL Editor**에서 `migrations/` 파일을 **번호 순서대로** 하나씩 붙여 넣고 Run.

| 파일 | 내용 |
|---|---|
| `0001_schema.sql` | 표 15개, 가입 시 profiles 자동 생성 트리거 |
| `0002_rls.sql` | 권한과 행 수준 보안. 학생은 자기 데이터만, 기준 데이터는 읽기만 |
| `0003_storage.sql` | 비공개 버킷 `records` (20MB), 경로 `{owner_id}/{record_id}/{version}/{파일명}` |
| `0004_tag_dictionary.sql` | 규칙 사전 v0.5 등록 |

프로젝트를 만들 때 Security 설정은 *Enable Data API* 켜기, *Automatically expose new tables* 끄기, *Enable automatic RLS* 켜기.

이미 적용한 파일은 고치지 않는다. 바꿀 것이 생기면 `0005_…sql`처럼 새 파일을 추가한다.

## 시드 데이터 (김서윤 가상 사례)

프로젝트 5개 · 기록 25개. 프로토타입 HTML의 샘플을 옮긴 가상 데이터입니다.

1. 대시보드 **Authentication → Users → Add user**: 이메일 `seoyun@record.test`, 비밀번호는 팀에서 정함, *Auto Confirm User* 체크
2. SQL Editor에서 `seed/seed_seoyun.sql` 실행 (빈 DB에 먼저 넣어야 합니다)

확인: projects 5줄, records 25줄, experiences 30줄, analysis_runs 1줄.

## 표 구조

```
auth.users ─ profiles
     │
     ├─ projects ─┬─ records ─ record_versions ─┐
     │            └──────────────── experiences ◀┘   (태그: 버전 단위 / 개요: 프로젝트 단위)
     ├─ analysis_runs      계산 결과 + 그때 쓴 버전
     ├─ graph_notes ─ note_projects ─ projects
     ├─ scraps · todos · portfolios
기준 데이터(읽기 전용): tag_dictionary · major_profiles · job_profiles · universities
```

| 표 | 한 줄 설명 |
|---|---|
| `profiles` | 로그인 사용자. 가입하면 자동 생성 |
| `projects` | 프로젝트 |
| `records` | 기록 하나. `no`가 문장 ID의 N 번호 (`N11·V1·S2`) |
| `record_versions` | 본문이 바뀔 때마다 한 줄. `sentences`에 문장 목록 |
| `experiences` | 태그·개요. `source` = rule / ai / student |
| `analysis_runs` | 연결선(graph)·학과(college)·직무(career) 계산 결과 |
| `tag_dictionary` | 규칙 사전 JSON을 버전별로 보관. `active` 한 개 |
| `major_profiles` · `job_profiles` | 점수표. `weights` = {태그코드: 1~3} |
| `universities` | 학과별 개설 대학 (점수 없음) |
| `graph_notes` · `note_projects` | 그래프 노트와 연결 프로젝트 |
| `scraps` · `todos` · `portfolios` | 스크랩, 할 일, 포트폴리오(초안 `draft` / 수정본 `content`) |

## 와이어프레임과 다른 점 (이유)

| 변경 | 이유 |
|---|---|
| `experiences.project_id` 추가, `record_version_id`는 비울 수 있음 | 개요는 프로젝트 전체 기록으로 만든다. 버전 하나에 매달 수 없어서, 비어 있으면 "프로젝트 개요" 행으로 본다. 입력 버전은 `input_refs` |
| 모든 학생 표에 `owner_id` | RLS 조건을 `owner_id = 로그인 사용자` 하나로 통일 |
| `records.no` | 문장 ID의 N 번호. uuid로는 `N11`을 만들 수 없다 |
| `records.url`, `records.answer_key` | 링크 기록, 보완 질문 답변(와이어프레임 S1-b·S1-e에 있던 값) |
| `profiles.ui_state` | 그래프 마지막 위치(와이어프레임 S2 데이터) |
| 점수표 `unique(code, profile_version)` | 점수표를 다시 만들어도 지난 계산 결과가 가리키는 행이 남는다 |

넣지 않은 것: AI 근거 검증 캐시, PDF 자동 분할 필드. 해당 기능을 만들 때 새 마이그레이션으로 추가한다.

## JSON 필드 모양

```jsonc
// record_versions.sentences
[{ "sid": "N11·V1·S2", "n": 2, "text": "…", "page": 1, "hash": "…", "entry_date": "2026-03-04" }]
// experiences.tags  (학생이 지운 태그는 source=student 행에 removed:true)
[{ "code": "M06", "sid": "N11·V1·S2", "matched": "파생 변수" }]
// experiences.fields (개요 6항목)
{ "role": { "text": "…", "sids": ["N11·V1·S2"] }, "activity": {}, "problem": {}, "process": {}, "result": {}, "reflection": {} }
// analysis_runs.relations
[{ "a": "<project_id>", "b": "<project_id>", "score": 0.64, "shared": ["M06"], "evidence": { "<project_id>": ["N11·V1·S2"] } }]
// analysis_runs.recommendations
[{ "profile_id": "…", "score": 75, "breadth": 100, "depth": 50, "depth_project_id": "…",
   "cells": [{ "tag": "M06", "weight": 3, "hits": { "<project_id>": ["N11·V1·S2"] } }], "explanation": null }]
```

태그 병합 순서: 같은 문장·같은 태그는 `student > ai > rule`.

## 키 관리

- `anon` 키: 브라우저에서 써도 된다(RLS가 막는다).
- `service_role` 키: RLS를 무시한다. **서버·수집 스크립트에서만**, 저장소에 올리지 않는다.
- 키는 `.env.local`에 두고 커밋하지 않는다. 항목은 저장소 루트의 `.env.example` 참고.
