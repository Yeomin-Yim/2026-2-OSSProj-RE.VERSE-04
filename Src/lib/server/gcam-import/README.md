# 거캠 회고록 가져오기 (서버)

학생이 거꾸로캠퍼스 '거캐머의 하루'에서 내려받은 PDF를 올리면, 프로젝트와 노트가 자동으로 만들어집니다.
PDF는 글자 없이 이미지로만 되어 있어서, OpenAI로 글자를 읽고(OCR) 프로젝트별로 묶습니다.

| 파일 | 하는 일 |
|---|---|
| `import.ts` | 전체 흐름: 업로드 → 읽기 → 묶기 → 확정 저장. 진행 상태는 `imports` 표에 저장 |
| `ocr.ts` | PDF 쪽마다 그림을 꺼내 글자로 옮긴다 (10쪽 ≈ 20초) |
| `group.ts` | 오후 칸들을 프로젝트·노트로 묶는 AI 호출과 프롬프트 |
| `draft.ts` | 초안 만들기. 오전 과목 칸은 코드가 과목 프로젝트('국어' 등)에, 나머지는 AI가 묶는다 |

칸 나누기 같은 계산은 `lib/core/gcam-import/gcam.ts`에 있습니다.

## 화면에서 쓰는 순서

서버 액션은 `app/(app)/projects/importActions.ts`에 있습니다. 모두 `{ ok: true, ... }` 또는 `{ ok: false, message }`를 돌려줍니다.

```ts
import { startImport, stepImport, confirmImport } from "@/app/(app)/projects/importActions";
import { noteText } from "@/lib/core/index.ts";

// ① 가져오기를 만들고, 받은 주소로 PDF를 직접 올린다 (서버를 거치지 않음, 30MB까지)
const s = await startImport(file.name);
await fetch(s.uploadUrl, { method: "PUT", body: file, headers: { "content-type": "application/pdf" } });

// ② ready 가 될 때까지 반복. 한 번에 약 30쪽씩 읽고, 다 읽으면 묶는다 (마지막 한 번이 40~50초)
let r = await stepImport(s.id);
while (r.ok && r.import.status === "reading") {
  setProgress(r.import.pages_done, r.import.page_count);   // 진행률
  r = await stepImport(s.id);
}
// 실패(r.ok === false)하면 r.message 를 보여 주고, "다시 시도"에서 stepImport 를 다시 부르면 이어서 한다

// ③ 미리보기: r.import.draft 를 화면에 그린다. 노트 본문은 noteText(r.import.units, note.unit_ids)
// ④ 학생이 고친 draft 를 그대로 보낸다
const done = await confirmImport(s.id, editedDraft);   // done.message: "노트 12개를 만들고 0개를 갱신했어요"
```

**시간 제한**: 가장 긴 단계(묶기)가 40~50초이고, Vercel 프로젝트의 함수 제한은 300초라 따로 설정할 것이 없습니다.

새로고침해서 화면이 처음으로 돌아가도, 가져오기 `id`를 기억해 두었다면 `getImport(id)`로 이어서 열 수 있습니다.

## 프로젝트가 아닌 기록을 나누는 방법 (2026-11-27 개편)

예전에는 학생회·체육·강연까지 모두 '애매한 노트'로 넘겨서, 학생이 한 학기 30개 안팎을 하나씩 골라야 했다.
지금은 AI 가 종류(kind)만 고르고 코드가 자리를 정한다 (`group.ts` 프롬프트, `draft.ts`).

| AI 가 고른 종류 | 자리 | 학생에게 묻나 |
|---|---|---|
| `school` 학교생활·행사 | 일반 활동 | 아니요 (접어 둠) |
| `class` 교과 수업 (+subject) | 그 과목 프로젝트 | 아니요 |
| `empty` 활동이 없던 날 | 저장 안 함 (`skipped`) | 아니요 (되살릴 수 있음) |
| `unsure` 정말 애매함 | 학생이 고름 | **예**, 추천 후보 버튼 |

코드 안전장치
- `school` 인데 제목에 인터뷰·리서치·팀 회의·발표 준비·프로토타입 같은 말이 있으면 `unsure` 로 올린다. 묻지 않고 넘어가는 칸이라, 잘못 들어가면 학생이 놓치기 때문이다.
- AI 가 빠뜨린 칸은 규칙으로 먼저 정한다: 행사 말이면 school, 아파서·결석이면 skipped, 아니면 unsure.
- unsure 에 후보가 없으면, 그날 진행 중이던 프로젝트와 노트 글에 겹치는 말(개주프·영상 …)로 추천을 단다.

시험 (학생 5명): 확인할 노트가 13~24개에서 0~4개로 줄었다 (`zz_local/gschool/compare_draft.ts`).

## 초안(draft) 모양

```jsonc
{
  "projects": [
    {
      "title": "비건 정보 접근성 개선",
      "existing_project_id": "uuid 또는 null",   // null 이면 저장할 때 새로 만든다
      "origin": "ai",                             // "subject" = 오전 과목 프로젝트(코드가 배정), "ai" = AI가 묶음
      "notes": [{ "title": "설문 문항 만들기", "date": "2026-09-22", "unit_ids": ["U0041", "U0042"] }],
      "questions": []                             // AI가 학생에게 확인하고 싶은 것 (보여 주기만)
    }
  ],
  "unassigned": [                                 // 프로젝트가 아닌 노트. 옮기지 않으면 '일반 활동'에 저장
    // kind "school": 학교생활·행사 (학생에게 묻지 않음, 화면에서 접어 둠)
    // kind "unsure": 정말 애매함 → 화면 맨 위 '골라 주세요' 카드. candidates 첫째가 추천 (AI 후보, 없으면 날짜·겹치는 말로 코드가 찾음)
    { "title": "…", "date": "2026-10-01", "unit_ids": ["U0070"], "kind": "unsure", "candidates": ["프로젝트 제목"], "question": "이 인터뷰는 …의 리서치였나요?" }
  ],
  "skipped": [                                    // 활동이 없던 날(아파서·결석·"딱히 없음"). 저장하지 않지만 화면에서 '그래도 저장' 가능
    { "title": "…", "date": "…", "unit_ids": ["…"], "reason": "활동이 없던 날" }
  ],
  "general_project_id": "uuid 또는 null",         // 학생의 '일반 활동' 프로젝트
  "excluded": [{ "unit_ids": ["U0001"], "reason": "머리글·빈 칸·마지막 수정" }]   // 저장하지 않는 부분
}
```

미리보기에서 학생이 할 수 있는 것은 모두 이 JSON을 고치는 일입니다.

| 학생이 하는 일 | draft 에서 바꾸는 것 |
|---|---|
| 프로젝트·노트 제목 고치기 | `title` |
| 노트를 다른 프로젝트로 옮기기 | 노트 객체를 다른 `projects[].notes`로 옮긴다 |
| 미분류 노트 배정하기 (확정 전 팝업) | `unassigned`에서 꺼내 프로젝트의 `notes`에 넣는다. 그대로 두면 '일반 활동'으로 저장된다 |
| 노트 빼기 (저장 안 함) | 그 노트를 지운다 |
| 기존 프로젝트에 붙이기 | `existing_project_id`에 내 프로젝트 id |

`unit_ids`는 바꾸지 않습니다. 노트 본문은 서버가 원문으로 다시 만들기 때문에, 화면이 보낸 본문은 쓰지 않습니다.

## 저장할 때 규칙

- 노트는 `kind = "reflection"`, `recorded_at` = 거캠 날짜로 저장됩니다. 본문은 원문 그대로입니다(AI 요약 아님).
- 프로젝트는 `existing_project_id` → 같은 제목의 내 프로젝트 → 새로 만들기 순서로 찾습니다.
- **중복 없음**: 노트마다 거캠 칸 키(`records.source_key`, 예: `gcam:2026-09-22:pm:0`)를 저장합니다.
  - 확정을 두 번 눌러도, 저장 도중 실패해 다시 눌러도 같은 노트가 두 번 생기지 않습니다.
  - 더 새 PDF를 다시 올리면, 이미 있는 칸은 거캠 쪽 본문이 바뀐 경우에만 새 버전이 생깁니다.
  - 학생이 앱에서 직접 고친 노트는 다시 가져와도 그대로 둡니다 (`records.source_hash`로 확인).
  - 가져오기는 아무것도 지우지 않습니다. 학생이 직접 만든 프로젝트·노트는 그대로이고, 새 프로젝트·노트만 더해집니다.
  - 이미 있는 노트는 프로젝트를 옮기지 않습니다. 학생이 옮겨 둔 것을 되돌리지 않기 위해서입니다.
- 저장이 끝나면 연결선을 한 번 다시 계산합니다.

## 저장한 뒤 노트 옮기기

`app/(app)/projects/actions.ts`의 `moveRecord(recordId, projectId)`를 씁니다. 노트의 태그도 함께 옮겨집니다.

## 비용과 시간 (gpt-5.4-mini, 2026-11 실측)

| 단계 | 비용 | 시간 |
|---|---|---|
| 읽기 (OCR) | 36쪽 $0.14, 53쪽 $0.20 | 30쪽당 약 25초 |
| 묶기 | 약 $0.05 | 40~50초 |

한 파일은 120쪽까지 받습니다. 호출별 사용량은 `imports.usage`에 남습니다.
