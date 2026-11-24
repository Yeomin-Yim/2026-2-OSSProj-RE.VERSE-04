# 프로젝트 탭 (서버)

| 파일 | 하는 일 |
|---|---|
| `projects.ts` | 프로젝트·기록·개요 조회와 저장 |
| `records.ts` | 기록 저장(버전 → 문장 → 규칙 태그), 본문 수정, 다른 프로젝트로 옮기기, 삭제 |
| `files.ts` | 파일 업로드: 파일 1개 = 노트 1개. 글자 PDF·DOCX는 글 추출, 사진은 파일만 |

화면은 `app/(app)/projects/actions.ts`의 서버 액션으로 부릅니다.

## 파일 올리기 (화면에서 쓰는 순서)

```ts
import { prepareFile, addFile, openFile } from "@/app/(app)/projects/actions";

// ① 업로드 주소 받기 (받지 않는 형식이면 여기서 ok:false)
const p = await prepareFile(file.name);
if (!p.ok) return toast(p.message);
// ② 브라우저가 Storage 에 직접 올리기 (30MB까지)
await fetch(p.uploadUrl, { method: "PUT", body: file, headers: { "content-type": p.mime } });
// ③ 노트 만들기. message 를 알림으로 보여 준다 (글자가 없는 PDF, 너무 긴 글 등도 여기서 알려 줌)
const r = await addFile({ recordId: p.recordId, project_id, title, fileName: file.name });

// 원본 보기 (사진 미리보기, 내려받기): 1분 동안 유효한 주소
const o = await openFile(record.id);   // o.url
```

| 파일 | 노트 종류(kind) | 저장되는 것 |
|---|---|---|
| PDF (글자 있는 것) | `document` | 파일 + 추출한 글 → 문장 분리·규칙 태깅 |
| PDF (스캔본, 글자 없음) | `document` | 파일만. "글자가 없는 파일이라 파일만 저장했어요" |
| DOCX | `document` | 파일 + 추출한 글 |
| JPG · PNG · WEBP | `photo` | 파일만 (증빙). 사진 설명은 만들지 않는다 |

- 제한: PDF 50쪽, 글 20,000자(넘으면 앞부분만 분석하고 원본은 그대로 저장), 파일 30MB.
- 받지 않는 것: HWP, PPTX, XLSX. PDF로 바꿔서 올리면 됩니다.
- 화면의 `record.raw_text`에는 추출한 글이 들어 있습니다. 학생이 본문을 고치면 새 버전이 생기고, 파일은 새 버전에도 그대로 붙어 있습니다.
- 기록을 지우면 Storage 의 파일도 지워집니다.

## 노트 옮기기

`moveRecord(recordId, projectId)` — 노트와 그 태그가 다른 프로젝트로 옮겨집니다. 버전은 만들지 않습니다.
