# 자체 키워드 파이프라인

규칙 사전(정규식 태그)을 대신해, 학생 기록과 커리어넷 원문에서 **키워드를 자동으로 뽑고 사전을 스스로 키우는** 방식.
AI(OpenAI)는 거름망을 통과하지 못한 **신규·모호한 후보에만** 쓰고, 판정 결과를 저장해 다음부터는 AI 없이 처리한다.

```
기록 저장 ─(after)─▶ refreshKeywords ─▶ runKeywordPipeline ─▶ experiences(source=ai, K:키워드) ─▶ recomputeGraph
커리어넷 원문 ──────▶ scripts/build_keyword_profiles.ts ─▶ runKeywordPipeline(profile) ─▶ major_profiles / job_profiles
```

키워드는 `K:대표이름` 코드로 기존 태그 자리에 들어간다. 그래서 연결 그래프(`computeRelations`)·추천(`scoreProfiles`)·화면 칩은 거의 그대로 쓴다.

## 단계와 판단

| 단계 | 파일 | 무엇을 | AI | 판단과 이유 |
|---|---|---|---|---|
| ① 정리 | `pipeline.ts` `cleanSentences` | 4자 미만·같은 문장 빼기 | ✗ | 문장 나누기는 이미 있음. 여기서는 최소한만 |
| ② 후보 추출 | `core/keywords/candidates.ts` | 조사·"하다" 떼기, 명사 + 붙은 명사구(2개) | ✗ | 형태소 분석기 없이 규칙. **일부러 넉넉하게**(최대 60개) 뽑는다. 처음에 빠진 키워드는 뒤에서 되살릴 수 없기 때문 |
| ② 고르기 | `core/keywords/select.ts` `pickCandidates` | KeyBERT(문서와의 유사도) + MMR(겹치는 후보 빼기) | ✗ (임베딩만) | 학생 15개, 원문 12개. 관련도 0.2 미만은 버림 |
| ③ 거름망 | `select.ts` `screen` | ⓐ 처리 이력 ⓑ 불용어 ⓒ 사전과 유사도 0.9 이상 | ✗ | 문맥에 따라 뜻이 바뀌는 말("모델")은 이력이 있어도 다시 묻는다(`context_free=false`) |
| ④ AI 검증 | `judge.ts` | 기존 키워드와 같음 / 새 키워드 / 버림 + 분류·중요도 | ✓ 1회 | 모호한 후보를 **한 번에 묶어서**(최대 25개). 가까운 기존 키워드 3개를 함께 보여 줘 이름이 갈라지지 않게 |
| ④ 검증 | `core/keywords/resolve.ts` | 없는 ID·보여 주지 않은 키워드·잘못된 분류 바로잡기 | ✗ | AI 답을 그대로 믿지 않는다. 답이 없는 후보는 이번엔 쓰지 않고 배우지도 않음 |
| ⑤ 확정·갱신 | `pipeline.ts` | 새 키워드 이름을 임베딩해 기존과 0.9 이상이면 합침 → 사전·이력 저장 | ✗ (임베딩만) | 사전이 같은 뜻으로 불어나지 않게 한 번 더 확인 |

학생 키워드는 처음엔 `candidate`, **두 프로젝트 이상**에서 나오면 `active`(`kw_touch`). 커리어넷 원문에서 나온 키워드는 바로 `active`.

### AI 를 줄이는 장치
- 처리 이력(`keyword_aliases`): 한 번 판정한 표현은 다음부터 AI 없이 처리
- 표현 임베딩 캐시: 한 번 본 표현은 임베딩도 다시 만들지 않음
- 지문(`keyword_runs.fingerprint`): 문장이 바뀐 프로젝트만 다시 돌림
- 학생 기록에서 AI 는 프로젝트당 최대 1회, 모호한 것만

`keyword_runs.stats` 에 실행마다 `self_known / self_dropped / ai_sent …` 가 남는다. **AI 로 보낸 비율이 쌓일수록 줄어드는지**를 이것으로 보여 줄 수 있다.

```sql
-- 실행 순서별 AI 비율
select created_at, (stats->>'ai_sent')::int as ai, (stats->>'candidates')::int as total,
       round((stats->>'ai_sent')::numeric / nullif((stats->>'candidates')::int, 0), 2) as ai_ratio
from keyword_runs order by created_at;
```

## 추천에서 쓰는 방법
- 점수표 = 커리어넷 원문을 같은 파이프라인에 통과시킨 키워드. 무게 = AI 중요도(high 3 / medium 2 / low 1)
- 학생 키워드가 점수표 키워드와 **이름이 같거나**, 임베딩 유사도 **0.8 이상**이면 그 칸을 채운 것으로 본다 (`core/keywords/related.ts`)
- 점수 공식(넓이·깊이)은 그대로

## 시험값 (정답 세트로 조정할 것)

| 값 | 지금 | 위치 |
|---|---|---|
| 관련도 최소 | 0.2 | `PARAMS.minRelevance` |
| 같은 키워드로 보기 | 0.9 | `PARAMS.sameAs` |
| AI 에 보여 줄 가까운 키워드 | 0.6 이상 3개 | `PARAMS.nearestMin/K` |
| 비슷한 키워드로 칸 채우기 | 0.8 | `RELATED_AS` |
| MMR | λ 0.7, 학생 15 / 원문 12 | `PARAMS` |

바꾸면 `PIPELINE_VERSION` 을 올린다 → 모든 프로젝트가 다음 저장 때 다시 계산된다.
정답 세트: 시드 프로젝트·거캠 기록에서 "이 둘은 같은 뜻 / 이 문장은 이 학과 근거"를 사람이 30~50쌍 표시하고, 기준값별 정확도를 비교한다.

## 실행

1. `supabase/migrations/0008_keywords.sql` 을 SQL Editor 에서 실행
2. 사전 씨앗 + 점수표 (Src 폴더에서, 처음 한 번)
   ```
   node --env-file=.env.local --experimental-strip-types scripts/build_keyword_profiles.ts profiles.csv --dry-run --only 569,591,834
   node --env-file=.env.local --experimental-strip-types scripts/build_keyword_profiles.ts profiles.csv
   ```
   `--dry-run` 도 키워드 사전은 채운다 (점수표만 저장 안 함).
3. 학생 기록은 저장할 때마다 자동. 이미 있는 기록은 아무 기록이나 한 번 저장하면 프로젝트 4개씩 계산된다.

## 환경변수

| 이름 | 기본 | 뜻 |
|---|---|---|
| `RECORD_MATCHING` | `auto` | `auto`: 키워드가 있는 프로젝트는 키워드, 없으면 규칙 태그 · `keywords`: 키워드만 · `rules`: 예전 방식으로 되돌리기(파이프라인도 안 돎) |
| `OPENAI_EMBED_MODEL` | `text-embedding-3-small` | 바꾸면 저장된 임베딩을 모두 다시 만들어야 함 |
| `OPENAI_EMBED_DIMENSIONS` | `512` | 〃 |

`OPENAI_API_KEY` 가 없으면 파이프라인은 건너뛰고 규칙 태그로 동작한다.

## 알려진 한계
- 후보 추출이 규칙 기반이라 조사 처리가 완벽하지 않다 (받침 없는 명사 + '이/가/의' 는 문서 안에 단독으로 나온 적이 있을 때만 뗀다)
- 프로젝트 연결은 같은 키워드만 센다 (비슷한 키워드 확장은 추천에만 적용)
- 기록 확인 7항목(`checks.ts`)은 그대로 정규식. "무슨 키워드냐"가 아니라 "역할·회고 문장이냐"를 보는 일이라 이 파이프라인과 다르다
- 학생 기록 문장이 OpenAI 로 간다 (거캠 가져오기·AI 개요와 같은 조건). 사람 이름 등은 AI 가 drop 하도록 지시했지만 비식별화는 하지 않는다
- 사전·이력 쓰기는 security definer 함수로만 가능하지만, 로그인한 학생 누구나 부를 수 있다 (크기·개수 제한만 있음)
