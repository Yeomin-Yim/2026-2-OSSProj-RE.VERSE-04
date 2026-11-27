import { computeRelations, forGraph, isSubjectProject, linkRarity, THRESHOLD, type Relation } from "@/lib/core/index.ts";
import type { Db } from "../auth";
import { loadDictionary } from "../dictionary";
import { listRecords, toProjectTags } from "../projects";
import { keywordCategories, matching, tagGroup } from "../keywords/meta";

/** 프로젝트 연결선을 다시 계산해 analysis_runs 에 새 줄로 남긴다. 기록이나 태그가 바뀔 때 부른다. */
export async function recomputeGraph(db: Db) {
  const [{ dict }, records, cats] = await Promise.all([loadDictionary(db), listRecords(db), keywordCategories(db)]);
  // 키워드가 있는 프로젝트는 키워드 + 공통 축으로, 없으면 규칙 태그로 (RECORD_MATCHING)
  const projects = forGraph(toProjectTags(records), matching());
  const relations = withoutSubjectPairs(computeRelations(projects, (code) => tagGroup(code, dict, cats), linkRarity), await subjectIds(db));

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
  // 기준이 바뀐 뒤 처음 열면 새 기준으로 다시 계산한다 (예전 0.18 계산이 남아 있으면 선이 거의 안 보인다)
  if (data && Number(data.threshold) !== THRESHOLD) {
    const relations = await recomputeGraph(db).catch(() => null);
    if (relations) return { relations: withoutSubjectPairs(relations, await subjectIds(db)), threshold: THRESHOLD };
  }
  return {
    // 예전에 저장한 연결에도 같은 규칙을 적용한다 (다시 계산하지 않아도)
    relations: withoutSubjectPairs((data?.relations ?? []) as Relation[], await subjectIds(db)),
    threshold: Number(data?.threshold ?? THRESHOLD),
  };
}

/**
 * 과목끼리의 연결은 뺀다 (판단기록 D27). 거캠으로 가져온 학생(말차 2학기)의 연결 21개 중 16개가
 * '과학—사회'·'국어—수학'처럼 수업이라 비슷한 말을 쓴다는 것뿐이라, 프로젝트 사이의 연결을 가렸다.
 * 과목—프로젝트 연결(수업에서 배운 것이 프로젝트와 이어짐)은 남긴다.
 */
function withoutSubjectPairs(relations: Relation[], subjects: Set<string>): Relation[] {
  return relations.filter((r) => !(subjects.has(r.a) && subjects.has(r.b)));
}

async function subjectIds(db: Db): Promise<Set<string>> {
  const { data, error } = await db.from("projects").select("id, title");
  if (error) throw new Error(error.message);
  return new Set(data.filter((p) => isSubjectProject(p.title)).map((p) => p.id));
}
