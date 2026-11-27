// 화면과 계산에서 꼬리표(규칙 태그 · 자체 키워드)의 이름과 그룹을 찾는 곳.

import { cache } from "react";
import {
  axisOf,
  AXIS_OVERRIDES,
  CATEGORY_GROUP,
  EXTRA_AXES,
  isAxisCode,
  isKeywordCode,
  keywordLabel,
  matchingMode,
  type KeywordCategory,
  type RuleDict,
  type TagGroup,
} from "@/lib/core/index.ts";
import type { Db } from "../auth";
import { loadKeywordCategories } from "./store";

export const matching = () => matchingMode(process.env.RECORD_MATCHING);

/** 키워드 이름 → 분류. 한 요청 안에서는 한 번만 읽는다 */
export const keywordCategories = cache((db: Db) => loadKeywordCategories(db));

const extra = new Map(EXTRA_AXES.map((a) => [a.code, a]));

/** 꼬리표 이름: 키워드는 그대로, 축·규칙 태그는 사전 이름 */
export function tagLabel(code: string, dict: RuleDict): string {
  if (isKeywordCode(code)) return keywordLabel(code);
  const c = axisOf(code);
  return AXIS_OVERRIDES[c]?.label ?? dict.tags[c]?.label ?? extra.get(c)?.label ?? c;
}

export function tagGroup(code: string, dict: RuleDict, cats: Map<string, KeywordCategory>): TagGroup | undefined {
  if (!isKeywordCode(code)) {
    const c = isAxisCode(code) ? axisOf(code) : code;
    return dict.tags[c]?.group ?? extra.get(c)?.group;
  }
  const cat = cats.get(keywordLabel(code));
  return cat ? CATEGORY_GROUP[cat] : "topic";
}

/** 화면 칩에 쓰는 {코드: {이름, 그룹}} */
export function tagInfoFor(codes: Iterable<string>, dict: RuleDict, cats: Map<string, KeywordCategory>) {
  const out: Record<string, { label: string; group: TagGroup }> = {};
  for (const code of codes) {
    const group = tagGroup(code, dict, cats);
    if (group) out[code] = { label: tagLabel(code, dict), group };
  }
  return out;
}
