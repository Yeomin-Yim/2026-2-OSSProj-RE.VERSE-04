// 키워드 사전·처리 이력을 Supabase 에 읽고 쓰는 부분 (supabase/migrations/0008_keywords.sql).
// 학생 세션 클라이언트와 서비스 키 클라이언트(터미널 스크립트) 둘 다 받는다.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { DictKeyword, KeywordCategory, Vec } from "../../core/keywords/index.ts";
import type { CachedAlias, KeywordStore } from "./pipeline.ts";

const PAGE = 1000;
const CHUNK = 200;

/** 임베딩은 소수점 6자리까지만 저장한다 (크기 절약, 유사도에는 영향 없음) */
const compact = (v: Vec) => v.map((x) => Math.round(x * 1e6) / 1e6);

export function supabaseKeywordStore(db: SupabaseClient): KeywordStore {
  return {
    async loadDictionary() {
      const out: DictKeyword[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await db.from("keywords").select("id, canonical, category, embedding, axes").order("id").range(from, from + PAGE - 1);
        if (error) throw new Error("키워드 사전을 읽지 못했어요: " + error.message);
        for (const r of data) out.push({ id: r.id, canonical: r.canonical, category: r.category as KeywordCategory, vector: r.embedding as Vec, axes: (r.axes as string[] | null) ?? [] });
        if (data.length < PAGE) return out;
      }
    },

    async loadAliases(surfaces) {
      const out = new Map<string, CachedAlias>();
      const unique = [...new Set(surfaces)];
      for (let i = 0; i < unique.length; i += CHUNK) {
        const { data, error } = await db
          .from("keyword_aliases")
          .select("surface, decision, keyword_id, context_free, embedding")
          .in("surface", unique.slice(i, i + CHUNK));
        if (error) throw new Error("처리 이력을 읽지 못했어요: " + error.message);
        for (const r of data) {
          out.set(r.surface, { surface: r.surface, decision: r.decision, keyword_id: r.keyword_id, context_free: r.context_free, vector: (r.embedding as Vec | null) ?? null });
        }
      }
      return out;
    },

    async saveEmbeddings(items) {
      for (let i = 0; i < items.length; i += CHUNK) {
        const { error } = await db.rpc("kw_cache_embeddings", {
          p_items: items.slice(i, i + CHUNK).map((x) => ({ surface: x.surface, embedding: compact(x.vector) })),
        });
        if (error) throw new Error("임베딩을 저장하지 못했어요: " + error.message);
      }
    },

    async learn(created, aliases, axesFor = []) {
      const { data, error } = await db.rpc("kw_learn", {
        p_keywords: created.map((k) => ({ canonical: k.canonical, category: k.category, embedding: compact(k.vector), origin: k.origin, axes: k.axes })),
        p_aliases: aliases,
        p_axes_for: axesFor,
      });
      if (error) throw new Error("키워드 사전을 갱신하지 못했어요: " + error.message);
      return new Map((data as { canonical: string; id: number }[] | null ?? []).map((r) => [r.canonical, r.id]));
    },
  };
}

/** 프로젝트에 처음 붙은 키워드의 사용 수를 올린다 */
export async function touchKeywords(db: SupabaseClient, ids: number[]) {
  if (!ids.length) return;
  const { error } = await db.rpc("kw_touch", { p_ids: ids });
  if (error) console.error("키워드 사용 수 갱신 실패:", error.message);
}

/** 키워드 대표 이름 → 분류 (화면 라벨·연결 가중치용). 사전 전체를 읽지 않고 이름·분류만 */
export async function loadKeywordCategories(db: SupabaseClient): Promise<Map<string, KeywordCategory>> {
  const out = new Map<string, KeywordCategory>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db.from("keywords").select("canonical, category").order("id").range(from, from + PAGE - 1);
    if (error) {
      // 마이그레이션 전이면 표가 없다: 키워드 없이 그대로 동작
      console.warn("키워드 분류를 읽지 못했어요:", error.message);
      return out;
    }
    for (const r of data) out.set(r.canonical, r.category as KeywordCategory);
    if (data.length < PAGE) return out;
  }
}
