// 키워드 파이프라인 ④⑤ : AI 판정을 검증하고, 프로젝트의 최종 키워드와 사전에 배울 내용을 만든다.
// AI 가 낸 값은 그대로 믿지 않는다: 없는 후보 ID · 보여 주지 않은 기존 키워드 · 잘못된 분류는 코드가 바로잡는다.

import type { Tag } from "../types.ts";
import type { DictKeyword, KeywordCategory, Scored, Verdict } from "./select.ts";
import { axisCode, axisOf, cleanAxes, guardAxes, isAxisCode } from "./axes.ts";

export const KEYWORD_PREFIX = "K:";
export const CATEGORIES: KeywordCategory[] = ["topic", "activity", "tech", "output"];
export type Importance = "high" | "medium" | "low";
export const IMPORTANCE_WEIGHT: Record<Importance, number> = { high: 3, medium: 2, low: 1 };

/** 키워드 → 태그 코드. 같은 대표 이름이면 학생·학과·직무가 같은 코드를 쓴다 */
export const keywordCode = (canonical: string) => KEYWORD_PREFIX + canonical;
export const isKeywordCode = (code: string) => code.startsWith(KEYWORD_PREFIX);
export const keywordLabel = (code: string) => (isKeywordCode(code) ? code.slice(KEYWORD_PREFIX.length) : code);

/** AI 가 후보 하나에 내린 판정 (judge.ts 의 JSON 스키마와 같다) */
export interface AiJudgment {
  id: string;
  decision: "existing" | "new" | "drop";
  keyword: string;
  category: string;
  importance: string;
  context_free: boolean;
  /** 공통 축 코드 0~3개 */
  axes?: string[];
}

/** AI 에 보낸 모호한 후보. id 는 "c1", "c2" … */
export interface AskItem {
  id: string;
  verdict: Extract<Verdict, { kind: "ambiguous" }>;
  /** AI 에 보여 준 축 후보 (임베딩 상위) */
  axes?: string[];
}

export interface FinalKeyword {
  canonical: string;
  category: KeywordCategory;
  /** 사전에 이미 있으면 id, 이번에 새로 만들 키워드면 null */
  keyword_id: number | null;
  importance: Importance;
  /** 근거 문장 (후보가 나온 문장. 추출 단계에서 나온 것이라 실제로 있는 문장이다) */
  sids: string[];
  /** 이 키워드로 모인 원래 표현 */
  surfaces: { surface: string; display: string }[];
  via: "self" | "ai";
  /** 공통 축 (2층). 추천은 이것으로 계산한다 */
  axes: string[];
}

/** 처리 이력에 남길 판정 (다음부터 같은 표현은 AI 없이 처리) */
export interface LearnAlias {
  surface: string;
  decision: "keyword" | "stop";
  canonical: string | null;
  context_free: boolean;
}

export interface Resolved {
  keywords: FinalKeyword[];
  learn: LearnAlias[];
  /** 사전에 새로 넣을 키워드 (임베딩을 만들어 중복을 한 번 더 확인한 뒤 넣는다) */
  created: { canonical: string; category: KeywordCategory; axes: string[] }[];
  /** 사전에 있지만 축이 비어 있던 키워드에 이번에 정한 축 */
  axesFor: { canonical: string; axes: string[] }[];
  problems: string[];
  stats: { candidates: number; self_known: number; self_dropped: number; ai_sent: number; ai_existing: number; ai_new: number; ai_dropped: number; ai_missing: number };
}

/** 대표 이름 정리: 공백 하나, 앞뒤 기호 제거, 1~30자 */
export function cleanCanonical(s: string): string | null {
  const t = s.normalize("NFC").replace(/\s+/g, " ").replace(/^[\s"'`·,.\-]+|[\s"'`·,.\-]+$/g, "").trim();
  if (!t || t.length > 30 || /[\n\r\t]/.test(t)) return null;
  return t;
}

const asCategory = (c: string): KeywordCategory | null => (CATEGORIES as string[]).includes(c) ? (c as KeywordCategory) : null;
const asImportance = (i: string): Importance | null => (["high", "medium", "low"].includes(i) ? (i as Importance) : null);

export function resolve(
  verdicts: Verdict[],
  asked: AskItem[],
  judgments: AiJudgment[] | null,
  dict: DictKeyword[],
  knownAxes: Set<string> = new Set(),
): Resolved {
  const problems: string[] = [];
  const byCanonical = new Map(dict.map((k) => [k.canonical.toLowerCase(), k]));
  const final = new Map<string, FinalKeyword>();
  const learn: LearnAlias[] = [];
  const created = new Map<string, { canonical: string; category: KeywordCategory; axes: string[] }>();
  const axesFor = new Map<string, string[]>();
  const stats = { candidates: verdicts.length, self_known: 0, self_dropped: 0, ai_sent: asked.length, ai_existing: 0, ai_new: 0, ai_dropped: 0, ai_missing: 0 };

  const keep = (cand: Scored, canonical: string, category: KeywordCategory, keyword_id: number | null, importance: Importance, via: "self" | "ai", axes: string[]) => {
    const key = canonical.toLowerCase();
    const cur = final.get(key);
    if (!cur) {
      final.set(key, { canonical, category, keyword_id, importance, sids: [...cand.sids], surfaces: [{ surface: cand.surface, display: cand.display }], via, axes: [...axes] });
      return;
    }
    if (!cur.axes.length && axes.length) cur.axes = [...axes];
    for (const s of cand.sids) if (!cur.sids.includes(s)) cur.sids.push(s);
    cur.surfaces.push({ surface: cand.surface, display: cand.display });
    if (IMPORTANCE_WEIGHT[importance] > IMPORTANCE_WEIGHT[cur.importance]) cur.importance = importance;
    if (via === "ai") cur.via = "ai";
  };

  // AI 없이 처리한 것
  for (const v of verdicts) {
    if (v.kind === "known") {
      stats.self_known++;
      keep(v.cand, v.keyword.canonical, v.keyword.category, v.keyword.id, "medium", "self", v.keyword.axes ?? []);
    } else if (v.kind === "drop") stats.self_dropped++;
  }

  // AI 판정 검증
  const answers = new Map<string, AiJudgment>();
  for (const j of judgments ?? []) {
    if (!asked.some((a) => a.id === j.id)) problems.push(`없는 후보 ID ${j.id}`);
    else if (answers.has(j.id)) problems.push(`같은 후보에 두 번 답함 ${j.id}`);
    else answers.set(j.id, j);
  }

  for (const { id, verdict } of asked) {
    const j = answers.get(id);
    const cand = verdict.cand;
    if (!j) {
      // 답이 없으면 이번에는 쓰지 않고, 배우지도 않는다 (다음 실행에서 다시 묻는다)
      stats.ai_missing++;
      continue;
    }
    if (j.decision === "drop") {
      stats.ai_dropped++;
      learn.push({ surface: cand.surface, decision: "stop", canonical: null, context_free: j.context_free });
      continue;
    }

    const importance = asImportance(j.importance) ?? (problems.push(`${id}: 중요도 ${j.importance} → medium`), "medium");
    const name = cleanCanonical(j.keyword);
    if (!name) {
      problems.push(`${id}: 쓸 수 없는 키워드 이름 "${j.keyword}" → 버림`);
      stats.ai_dropped++;
      continue;
    }

    // existing: 보여 준 가까운 키워드 중 하나여야 한다. 아니어도 사전에 같은 이름이 있으면 그것으로 본다
    const offered = verdict.nearest.find((n) => n.keyword.canonical.toLowerCase() === name.toLowerCase())?.keyword;
    const exact = byCanonical.get(name.toLowerCase());
    if (j.decision === "existing" && !offered) problems.push(`${id}: 보여 주지 않은 기존 키워드 "${name}"`);
    const existing = offered ?? exact;

    // 축: 아는 코드만. 보여 준 후보 밖의 코드는 기록만 남기고 받아 준다 (AI 가 더 맞을 수 있음)
    const axes = cleanAxes(j.axes, knownAxes);
    const outside = axes.filter((a) => !(asked.find((x) => x.id === id)?.axes ?? []).includes(a));
    if (outside.length) problems.push(`${id}: 보여 주지 않은 축 ${outside.join(",")}`);

    if (existing) {
      stats.ai_existing++;
      // 사전 키워드의 축은 처음 정한 것을 계속 쓴다 (일관성). 비어 있을 때만 이번 판정으로 채운다
      const has = existing.axes?.length ? existing.axes : axes;
      if (!existing.axes?.length && axes.length) axesFor.set(existing.canonical, axes);
      keep(cand, existing.canonical, existing.category, existing.id, importance, "ai", has);
      learn.push({ surface: cand.surface, decision: "keyword", canonical: existing.canonical, context_free: j.context_free });
      continue;
    }

    const category = asCategory(j.category) ?? (problems.push(`${id}: 분류 ${j.category} → topic`), "topic");
    stats.ai_new++;
    const key = name.toLowerCase();
    const madeBefore = created.get(key);
    const canonical = madeBefore?.canonical ?? name;
    if (!madeBefore) created.set(key, { canonical, category, axes });
    keep(cand, canonical, madeBefore?.category ?? category, null, importance, "ai", madeBefore?.axes ?? axes);
    learn.push({ surface: cand.surface, decision: "keyword", canonical, context_free: j.context_free });
  }

  return { keywords: [...final.values()], learn, created: [...created.values()], axesFor: [...axesFor].map(([canonical, axes]) => ({ canonical, axes })), problems, stats };
}

/**
 * 최종 키워드 → 기록 문장에 붙는 태그 (experiences.tags 와 같은 모양)
 *   K:키워드 (1층, matched = 원문 표현) + A:축코드 (2층, matched = 키워드 이름 → "왜 이 축?" 의 근거)
 */
export function toKeywordTags(keywords: FinalKeyword[]): Tag[] {
  const tags: Tag[] = [];
  for (const k of keywords) {
    const matched = k.surfaces[0]?.display ?? k.canonical;
    for (const sid of k.sids) {
      tags.push({ code: keywordCode(k.canonical), sid, matched });
      for (const a of guardAxes(k.canonical, k.axes)) tags.push({ code: axisCode(a), sid, matched: k.canonical });
    }
  }
  return tags;
}

/** 학과·직무 점수표 무게: 축마다 그 축에 붙은 키워드 중 가장 높은 중요도 (high 3 / medium 2 / low 1) */
export function axisWeights(keywords: (Pick<FinalKeyword, "axes" | "importance"> & { canonical?: string })[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of keywords) for (const a of k.canonical ? guardAxes(k.canonical, k.axes) : k.axes) out[a] = Math.max(out[a] ?? 0, IMPORTANCE_WEIGHT[k.importance]);
  return out;
}

/**
 * 이미 저장된 축 태그에도 지금의 바로잡기 규칙을 적용한다 (읽을 때).
 * 축 태그(A:…)의 matched 는 키워드 이름이므로, guardAxes 로 그 축을 바꾸거나 뺀다. 규칙이 늘어도 기록을 다시 정리하지 않아도 된다.
 */
export function regardTags(tags: Tag[]): Tag[] {
  const out: Tag[] = [];
  for (const t of tags) {
    if (!isAxisCode(t.code)) { out.push(t); continue; }
    for (const a of guardAxes(t.matched, [axisOf(t.code)])) out.push({ ...t, code: axisCode(a) });
  }
  return out;
}
