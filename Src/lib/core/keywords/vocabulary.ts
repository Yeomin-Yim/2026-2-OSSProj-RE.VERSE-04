// 어느 꼬리표로 계산할지 고른다.
//   규칙 태그  : "M04"        (정규식, 예전 방식)
//   자유 키워드: "K:설문 문항"  (1층, 의미로 뽑음)
//   공통 축    : "A:M04"      (2층, 의미로 붙임. 코드 체계는 규칙 태그와 같다)
//
// RECORD_MATCHING
//   auto (기본) : 키워드·축이 만들어진 프로젝트는 그것을, 아직 없는 프로젝트는 규칙 태그를
//   keywords    : 키워드·축만
//   rules       : 규칙 태그만 (예전 방식으로 되돌릴 때)
//
// 축과 규칙 태그는 같은 코드라서, 축을 쓰는 프로젝트와 규칙 태그를 쓰는 프로젝트가 섞여 있어도 같은 점수표로 계산된다.

import type { ProjectTags, Tag, TagGroup } from "../types.ts";
import { axisOf, isAxisCode } from "./axes.ts";
import { isKeywordCode } from "./resolve.ts";
import type { KeywordCategory } from "./select.ts";

export type Matching = "auto" | "keywords" | "rules";

export function matchingMode(value: string | undefined): Matching {
  return value === "keywords" || value === "rules" ? value : "auto";
}

/** 키워드 분류 → 연결 계산의 그룹 가중치 (lib/core/graph GROUP_WEIGHT) */
export const CATEGORY_GROUP: Record<KeywordCategory, TagGroup> = { topic: "topic", activity: "method", tech: "tool", output: "output" };

const isMeaningCode = (code: string) => isKeywordCode(code) || isAxisCode(code);
const isRuleCode = (code: string) => !isMeaningCode(code);

/** 이 프로젝트가 의미 기반 꼬리표(키워드·축)를 쓰나 */
function usesMeaning(codes: string[], mode: Matching): boolean {
  if (mode === "rules") return false;
  if (mode === "keywords") return true;
  return codes.some(isMeaningCode);
}

function merge(into: Map<string, string[]>, code: string, sids: string[]) {
  into.set(code, [...new Set([...(into.get(code) ?? []), ...sids])]);
}

/**
 * 추천 계산용: 축 코드만 (A: 를 떼서 규칙 태그와 같은 코드로).
 * 아직 키워드가 없는 프로젝트는 규칙 태그를 그대로 쓴다.
 */
export function forRecommend(projects: ProjectTags[], mode: Matching): ProjectTags[] {
  return projects.map((p) => {
    if (!usesMeaning([...p.tags.keys()], mode)) return { id: p.id, tags: new Map([...p.tags].filter(([c]) => isRuleCode(c))) };
    const tags = new Map<string, string[]>();
    for (const [c, sids] of p.tags) if (isAxisCode(c)) merge(tags, axisOf(c), sids);
    return { id: p.id, tags };
  });
}

/** 프로젝트 연결용: 자유 키워드 + 축. 같은 키워드(드문 말이라 무겁다)와 같은 축(넓은 공통점)이 모두 연결 근거가 된다 */
export function forGraph(projects: ProjectTags[], mode: Matching): ProjectTags[] {
  return projects.map((p) => {
    if (!usesMeaning([...p.tags.keys()], mode)) return { id: p.id, tags: new Map([...p.tags].filter(([c]) => isRuleCode(c))) };
    const tags = new Map<string, string[]>();
    for (const [c, sids] of p.tags) {
      if (isKeywordCode(c)) merge(tags, c, sids);
      else if (isAxisCode(c)) merge(tags, axisOf(c), sids);
    }
    return { id: p.id, tags };
  });
}

/** 점수표 무게: 축 코드(A: 를 떼고)와 규칙 태그 코드만. 자유 키워드(K:) 칸은 쓰지 않는다 */
export function profileWeights(weights: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [c, w] of Object.entries(weights ?? {})) {
    if (isKeywordCode(c)) continue;
    const code = axisOf(c);
    out[code] = Math.max(out[code] ?? 0, w);
  }
  return out;
}

/** 한 프로젝트의 기록 태그 중 화면에 보여 줄 것 (키워드·축이 있으면 그것만) */
export function visibleTags(tags: Tag[], mode: Matching): Tag[] {
  const meaning = usesMeaning(tags.map((t) => t.code), mode);
  return tags.filter((t) => (meaning ? isMeaningCode(t.code) : isRuleCode(t.code)));
}

/** 프로젝트 전체 태그를 보고, 기록마다 같은 기준으로 거른다 (한 프로젝트 안에서 키워드·규칙 태그가 섞여 보이지 않게) */
export function filterProjectRecords<R extends { tags: Tag[] }>(records: R[], mode: Matching): R[] {
  const meaning = usesMeaning(records.flatMap((r) => r.tags.map((t) => t.code)), mode);
  return records.map((r) => ({ ...r, tags: r.tags.filter((t) => (meaning ? isMeaningCode(t.code) : isRuleCode(t.code))) }));
}
