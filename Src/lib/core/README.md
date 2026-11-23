# lib/core — 계산 로직

화면·DB와 무관한 순수 TypeScript입니다. 외부 패키지가 없고, `lib/server`에서 불러 씁니다.

여러 기능이 같이 쓰는 파일은 폴더 밖에, 한 기능만 쓰는 파일은 기능 폴더 안에 둡니다. 화면·서버에서는 `index.ts` 하나로 불러 씁니다.

| 위치 | 하는 일 | 주요 함수 |
|---|---|---|
| `text.ts` (공통) | 글 정리, 해시(본문·문장이 같은지 비교) | `normalize` `hash` |
| `sentences.ts` (공통) | 문장 나누기, 문장 ID (`N11·V1·S2`) | `toSentences` |
| `tagger.ts` (공통) | 규칙 사전 태깅, 출처별 태그 병합 | `createTagger` `mergeTags` `groupByCode` |
| `types.ts` (공통) | 공통 타입 | |
| `projects/checks.ts` | 프로젝트 탭: 기록 확인 7항목, 보완 질문(최대 2개) | `checkProject` `nextQuestions` |
| `graph/graph.ts` | 연결 그래프: 프로젝트 연결 (IDF 가중 자카드) | `computeRelations` |
| `recommend/recommend.ts` | 학과·직무 점수 (넓이 + 깊이) | `scoreProfiles` |
| `gcam-import/gcam.ts` | 거캠 회고록 OCR 결과를 날짜×오전/오후 칸으로 나누기, AI 묶음 바로잡기 | `parseSessions` `resolveAssignment` |

```ts
import { createTagger, toSentences, groupByCode, computeRelations } from "@/lib/core/index.ts";

const tagger = createTagger(dict);                       // tag_dictionary.dict (active)
const sentences = toSentences(text, record.no, version); // → record_versions.sentences
const tags = tagger.tagSentences(sentences);             // → experiences.tags (source=rule)
```

## 테스트

```bash
cd Src && npm test     # Node 22.18 이상 (TypeScript를 바로 실행)
```

테스트 파일은 운영 코드와 분리해 `Src/tests/<주제>/`에 둡니다 (`core/` 계산 로직, `gcam/` 거캠 회고록 칸 나누기).

## 시험값

`graph/graph.ts`의 `THRESHOLD`(0.18)·`GROUP_WEIGHT`, `recommend/recommend.ts`의 `BREADTH`·`DEPTH`(0.5/0.5)는 시험값입니다. 바꾸면 계산 결과가 달라지므로 팀 결정 후에 고칩니다.

## 아직 없는 것

- 일반 파일(글자 PDF·DOCX) 글 추출.
- AI 개요·근거 설명·초안. (거캠 회고록 OCR·묶기 AI 호출은 `lib/server/gcam-import/`에 있음)
