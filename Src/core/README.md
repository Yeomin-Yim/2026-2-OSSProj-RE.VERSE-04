# Src/core — 계산 로직

화면·DB와 무관한 순수 TypeScript입니다. 외부 패키지가 없고, Next.js로 옮긴 뒤 Route Handler에서 그대로 불러 씁니다.

| 파일 | 하는 일 | 주요 함수 |
|---|---|---|
| `text.ts` | 글 정리, 해시(본문·문장이 같은지 비교) | `normalize` `hash` |
| `sentences.ts` | 문장 나누기, 문장 ID (`N11·V1·S2`) | `toSentences` |
| `tagger.ts` | 규칙 사전 태깅, 출처별 태그 병합 | `createTagger` `mergeTags` `groupByCode` |
| `checks.ts` | 기록 확인 7항목, 보완 질문(최대 2개) | `checkProject` `nextQuestions` |
| `graph.ts` | 프로젝트 연결 (IDF 가중 자카드) | `computeRelations` |
| `recommend.ts` | 학과·직무 점수 (넓이 + 깊이) | `scoreProfiles` |

```ts
import { createTagger, toSentences, groupByCode, computeRelations } from "./Src/core/index.ts";

const tagger = createTagger(dict);                       // tag_dictionary.dict (active)
const sentences = toSentences(text, record.no, version); // → record_versions.sentences
const tags = tagger.tagSentences(sentences);             // → experiences.tags (source=rule)
```

## 테스트

```bash
node --test "Src/core/*.test.ts"     # Node 22.18 이상 (TypeScript를 바로 실행)
```

## 시험값

`graph.ts`의 `THRESHOLD`(0.18)·`GROUP_WEIGHT`, `recommend.ts`의 `BREADTH`·`DEPTH`(0.5/0.5)는 시험값입니다. 바꾸면 계산 결과가 달라지므로 팀 결정 후에 고칩니다.

## 아직 없는 것

- DB에 읽고 쓰는 코드(저장 흐름 연결). Next.js 구조가 정해지면 Route Handler에서 이 함수들을 불러 붙입니다.
- PDF·DOCX 글 추출(PDF.js, Mammoth).
- AI 호출(개요·근거 설명·초안).
