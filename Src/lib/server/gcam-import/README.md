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
  "unassigned": [                                 // 어느 프로젝트인지 애매한 노트
    { "title": "…", "date": "2026-10-01", "unit_ids": ["U0070"], "candidates": ["프로젝트 제목"], "question": "어느 프로젝트의 기록인가요?" }
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
