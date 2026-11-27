// 키워드 파이프라인 ②③ : 임베딩으로 후보를 고르고(KeyBERT + MMR), 사전·캐시로 판정한다.
// 모두 순수 함수. 임베딩 값은 밖에서 넣어 준다 (lib/server/keywords).

import type { Candidate } from "./candidates.ts";
import { STOPWORDS } from "./candidates.ts";

export type Vec = number[];
export type KeywordCategory = "topic" | "activity" | "tech" | "output";

/** 시험값. 바꾸면 PIPELINE_VERSION 도 올린다 (keyword_runs.params 에 함께 남는다) */
export const PIPELINE_VERSION = "kw-0.4"; // 0.4: 숫자+세는 말 떼기 (D19)
export const PARAMS = {
  /** 프로젝트 전체와의 관련도가 이보다 낮은 후보는 버린다 */
  minRelevance: 0.2,
  /** MMR 로 남길 후보 수 (학생 기록 / 학과·직무 원문) */
  keepStudent: 15,
  keepProfile: 12,
  /** MMR: 1 에 가까울수록 관련도, 0 에 가까울수록 다양성 */
  mmrLambda: 0.7,
  /** 사전 키워드와 이 이상 가까우면 같은 키워드로 보고 AI 없이 처리 */
  sameAs: 0.9,
  /** AI 에 보낼 때 함께 보여 줄 가까운 기존 키워드 수와 최소 유사도 */
  nearestK: 3,
  nearestMin: 0.6,
  /** 한 번의 AI 호출에 보내는 모호한 후보 최대 수 */
  maxAmbiguous: 25,
} as const;

export function cosine(a: Vec, b: Vec): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

export interface Scored extends Candidate {
  vector: Vec;
  relevance: number;
}

/**
 * KeyBERT: 후보와 프로젝트 전체(doc)의 유사도로 관련도를 매기고,
 * MMR 로 서로 겹치지 않게 k 개를 고른다 ("데이터", "데이터 분석", "분석" 이 다 뽑히지 않게).
 */
export function pickCandidates(
  cands: Candidate[],
  vectors: Map<string, Vec>,
  doc: Vec,
  k: number,
  p: { minRelevance: number; mmrLambda: number } = PARAMS,
  /** 관련도·MMR 과 상관없이 먼저 고르는 후보 (프로젝트 제목에 있는 말) */
  must: Set<string> = new Set(),
): Scored[] {
  const pool: Scored[] = cands
    .filter((c) => vectors.has(c.surface))
    .map((c) => ({ ...c, vector: vectors.get(c.surface)!, relevance: cosine(vectors.get(c.surface)!, doc) }))
    .filter((c) => c.relevance >= p.minRelevance || must.has(c.surface));

  const picked: Scored[] = [];
  for (let i = pool.length - 1; i >= 0; i--) if (must.has(pool[i].surface) && picked.length < k) picked.push(pool.splice(i, 1)[0]);
  while (picked.length < k && pool.length) {
    let bestI = 0, best = -Infinity;
    for (let i = 0; i < pool.length; i++) {
      const redundancy = picked.length ? Math.max(...picked.map((q) => cosine(pool[i].vector, q.vector))) : 0;
      const mmr = p.mmrLambda * pool[i].relevance - (1 - p.mmrLambda) * redundancy;
      if (mmr > best) [best, bestI] = [mmr, i];
    }
    picked.push(pool.splice(bestI, 1)[0]);
  }
  return picked;
}

/** 사전의 키워드 한 개 */
export interface DictKeyword {
  id: number;
  canonical: string;
  category: KeywordCategory;
  vector: Vec;
  /** 이 키워드가 붙는 공통 축 코드 (axes.ts). 한 번 정하면 다시 쓴다 */
  axes?: string[];
}

/** 처리 이력: 이 표현을 예전에 어떻게 판정했나 (keyword_aliases) */
export interface AliasMemo {
  surface: string;
  decision: "keyword" | "stop" | null;
  keyword_id: number | null;
  /** false 면 문맥에 따라 뜻이 달라지는 말("모델" 등) → 판정을 다시 쓰지 않는다 */
  context_free: boolean;
}

export interface Nearest { keyword: DictKeyword; sim: number }

export type Verdict =
  | { kind: "known"; cand: Scored; keyword: DictKeyword; how: "alias" | "exact" | "embedding"; sim?: number }
  | { kind: "drop"; cand: Scored; how: "alias" | "stopword" }
  | { kind: "ambiguous"; cand: Scored; nearest: Nearest[] };

export function nearestKeywords(v: Vec, dict: DictKeyword[], k: number, min = 0): Nearest[] {
  return dict
    .map((keyword) => ({ keyword, sim: cosine(v, keyword.vector) }))
    .filter((n) => n.sim >= min)
    .sort((a, b) => b.sim - a.sim)
    .slice(0, k);
}

/**
 * ③ 거름망: AI 없이 처리할 수 있는 후보를 먼저 처리한다.
 *   1) 처리 이력(별칭)이 있고 문맥과 무관하면 그 판정을 그대로 쓴다
 *   2) 불용어면 버린다
 *   3) 사전 키워드와 sameAs 이상 가까우면 그 키워드로 본다
 *   4) 나머지(신규·모호)만 AI 로 보낸다
 */
export function screen(
  picked: Scored[],
  aliases: Map<string, AliasMemo>,
  dict: DictKeyword[],
  p: { sameAs: number; nearestK: number; nearestMin: number } = PARAMS,
): Verdict[] {
  const byId = new Map(dict.map((k) => [k.id, k]));
  const squash = (s: string) => s.toLowerCase().replace(/\s+/g, "");
  const byName = new Map(dict.map((k) => [squash(k.canonical), k]));
  return picked.map<Verdict>((cand) => {
    const memo = aliases.get(cand.surface);
    if (memo?.context_free && memo.decision === "stop") return { kind: "drop", cand, how: "alias" };
    if (memo?.context_free && memo.decision === "keyword" && memo.keyword_id != null && byId.has(memo.keyword_id)) {
      return { kind: "known", cand, keyword: byId.get(memo.keyword_id)!, how: "alias" };
    }
    if (STOPWORDS.has(cand.surface)) return { kind: "drop", cand, how: "stopword" };
    // 사전 대표 이름과 띄어쓰기·대소문자만 다르면 같은 키워드 ("모바일애플리케이션" = "모바일 애플리케이션")
    const exact = byName.get(squash(cand.surface));
    if (exact) return { kind: "known", cand, keyword: exact, how: "exact" };

    const nearest = nearestKeywords(cand.vector, dict, p.nearestK, p.nearestMin);
    if (nearest[0] && nearest[0].sim >= p.sameAs) {
      return { kind: "known", cand, keyword: nearest[0].keyword, how: "embedding", sim: nearest[0].sim };
    }
    return { kind: "ambiguous", cand, nearest };
  });
}
