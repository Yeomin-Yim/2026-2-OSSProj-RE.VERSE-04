// 기록이 바뀐 프로젝트만 키워드 파이프라인을 다시 돌리고, 결과를 기록 태그(experiences, source=ai)로 저장한다.
// 저장 응답을 보낸 뒤(after) 실행된다. 실패해도 기록 저장에는 영향이 없고, 규칙 태그로 계속 동작한다.

import { hash, matchingMode, PARAMS, PIPELINE_VERSION, isKeywordCode, type Tag } from "@/lib/core/index.ts";
import { loadDictionary } from "../dictionary";
import { loadAxisVectors, ruleAxisHints } from "./axes";
import type { Db } from "../auth";
import { recomputeGraph } from "../graph";
import { embedTexts } from "../openai";
import { listProjects, listRecords, type RecordView } from "../projects";
import { JUDGE_VERSION, judgeWithOpenAI } from "./judge";
import { runKeywordPipeline, type Deps } from "./pipeline";
import { supabaseKeywordStore, touchKeywords } from "./store";

/** 한 번에 다시 계산할 최대 프로젝트 수 (나머지는 다음 저장 때). 서버 함수 시간 제한 대비 */
const MAX_PROJECTS_PER_RUN = 4;

export async function keywordDeps(db: Db): Promise<Deps> {
  const { dict } = await loadDictionary(db);
  return {
    axisHints: ruleAxisHints(dict),
    store: supabaseKeywordStore(db),
    embed: embedTexts,
    judge: judgeWithOpenAI,
    axes: async () => loadAxisVectors(dict, embedTexts),
  };
}

/** 프로젝트 문장의 지문. 파이프라인·프롬프트 버전이 바뀌어도 다시 돈다 */
export function fingerprint(records: RecordView[]): string {
  const hashes = records.flatMap((r) => r.sentences.map((s) => s.hash)).sort();
  return hash([PIPELINE_VERSION, JUDGE_VERSION, ...hashes].join("|"));
}

export async function refreshKeywords(db: Db): Promise<{ processed: number; skipped: number }> {
  if (!process.env.OPENAI_API_KEY || matchingMode(process.env.RECORD_MATCHING) === "rules") return { processed: 0, skipped: 0 };

  const [projects, records, runs] = await Promise.all([
    listProjects(db),
    listRecords(db),
    db.from("keyword_runs").select("project_id, fingerprint, created_at").order("created_at", { ascending: false }).limit(500),
  ]);
  if (runs.error) throw new Error(runs.error.message);
  const lastPrint = new Map<string, string>();
  for (const r of runs.data) if (r.project_id && !lastPrint.has(r.project_id)) lastPrint.set(r.project_id, r.fingerprint);

  const changed = projects
    .map((p) => ({ project: p, records: records.filter((r) => r.project_id === p.id) }))
    .map((x) => ({ ...x, print: fingerprint(x.records) }))
    .filter((x) => x.records.length && lastPrint.get(x.project.id) !== x.print);

  const deps = await keywordDeps(db);
  for (const x of changed.slice(0, MAX_PROJECTS_PER_RUN)) {
    await refreshProject(db, deps, x.project, x.records, x.print);
  }
  return { processed: Math.min(changed.length, MAX_PROJECTS_PER_RUN), skipped: Math.max(0, changed.length - MAX_PROJECTS_PER_RUN) };
}

async function refreshProject(
  db: Db,
  deps: Deps,
  project: { id: string; title: string; topic: string | null },
  records: RecordView[],
  print: string,
) {
  const before = new Set(records.flatMap((r) => r.tags).filter((t) => isKeywordCode(t.code)).map((t) => t.code));
  const result = await runKeywordPipeline(
    { mode: "student", title: project.title, topic: project.topic, sentences: records.flatMap((r) => r.sentences) },
    deps,
  );

  // 기록(현재 버전)마다 그 기록 문장에 붙은 키워드만 저장한다
  const versions = records.filter((r) => r.version_id);
  const bySid = new Map<string, string>();
  for (const r of versions) for (const s of r.sentences) bySid.set(s.sid, r.version_id!);
  const perVersion = new Map<string, Tag[]>();
  for (const t of result.tags) {
    const v = bySid.get(t.sid);
    if (v) perVersion.set(v, [...(perVersion.get(v) ?? []), t]);
  }

  const versionIds = versions.map((r) => r.version_id!);
  const del = await db.from("experiences").delete().in("record_version_id", versionIds).eq("source", "ai");
  if (del.error) throw new Error(del.error.message);
  if (perVersion.size) {
    const ins = await db.from("experiences").insert(
      [...perVersion].map(([record_version_id, tags]) => ({
        project_id: project.id,
        record_version_id,
        tags,
        source: "ai",
        rule_version: PIPELINE_VERSION,
      })),
    );
    if (ins.error) throw new Error(ins.error.message);
  }

  // 이 프로젝트에 처음 붙은 키워드만 사용 수를 올린다 (같은 프로젝트를 다시 돌려도 두 번 세지 않게)
  await touchKeywords(db, result.keywords.filter((k) => !before.has(k.code) && k.keyword_id != null).map((k) => k.keyword_id!));

  const run = await db.from("keyword_runs").insert({
    project_id: project.id,
    fingerprint: print,
    pipeline_version: `${PIPELINE_VERSION}/${JUDGE_VERSION}`,
    params: PARAMS,
    stats: result.stats,
    model: result.usage?.model ?? null,
    input_tokens: result.usage?.input_tokens ?? null,
    output_tokens: result.usage?.output_tokens ?? null,
    problems: result.problems.slice(0, 50),
  });
  if (run.error) throw new Error(run.error.message);
  if (result.problems.length) console.warn(`키워드 정리 바로잡음 (${project.title}):`, result.problems);
  console.info(`키워드 정리 (${project.title}):`, result.stats, result.usage);
}

/** 기록이 바뀐 뒤 부르는 것: 키워드 갱신 → 연결선 재계산. 키워드가 실패해도 연결선은 다시 계산한다 */
export async function afterRecordsChanged(db: Db) {
  await refreshKeywords(db).catch((e) => console.error("키워드 갱신 실패:", e));
  await recomputeGraph(db).catch((e) => console.error("연결선 재계산 실패:", e));
}
