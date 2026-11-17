import { createTagger, type RuleDict, type Tagger } from "@/lib/core/index.ts";
import type { Db } from "./auth";

let cached: { dict: RuleDict; tagger: Tagger } | null = null;

/** 활성 규칙 사전(tag_dictionary.active)과 컴파일된 태거. 서버 인스턴스마다 한 번만 읽는다. */
export async function loadDictionary(db: Db) {
  if (cached) return cached;

  const { data, error } = await db.from("tag_dictionary").select("dict").eq("active", true).single();
  if (error) throw new Error("규칙 사전을 읽지 못했습니다: " + error.message);

  const dict = data.dict as RuleDict;
  cached = { dict, tagger: createTagger(dict) };
  return cached;
}
