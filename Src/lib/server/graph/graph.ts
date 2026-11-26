import { computeRelations, forGraph, THRESHOLD, type Relation } from "@/lib/core/index.ts";
import type { Db } from "../auth";
import { loadDictionary } from "../dictionary";
import { listRecords, toProjectTags } from "../projects";
import { keywordCategories, matching, tagGroup } from "../keywords/meta";

/** 프로젝트 연결선을 다시 계산해 analysis_runs 에 새 줄로 남긴다. 기록이나 태그가 바뀔 때 부른다. */
export async function recomputeGraph(db: Db) {
  const [{ dict }, records, cats] = await Promise.all([loadDictionary(db), listRecords(db), keywordCategories(db)]);
  // 키워드가 있는 프로젝트는 키워드 + 공통 축으로, 없으면 규칙 태그로 (RECORD_MATCHING)
  const projects = forGraph(toProjectTags(records), matching());
  const relations = computeRelations(projects, (code) => tagGroup(code, dict, cats));

  const { error } = await db.from("analysis_runs").insert({
    purpose: "graph",
    input_refs: records.map((r) => r.version_id).filter(Boolean),
    rule_version: dict.version,
    threshold: THRESHOLD,
    relations,
  });
  if (error) throw new Error(error.message);
  return relations;
}

/** 가장 최근에 계산한 연결선 */
export async function latestRelations(db: Db): Promise<{ relations: Relation[]; threshold: number }> {
  const { data, error } = await db
    .from("analysis_runs")
    .select("relations, threshold")
    .eq("purpose", "graph")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return {
    relations: (data?.relations ?? []) as Relation[],
    threshold: Number(data?.threshold ?? THRESHOLD),
  };
}
