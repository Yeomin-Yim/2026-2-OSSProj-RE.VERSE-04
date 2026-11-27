// 기록이 바뀐 프로젝트만 키워드 파이프라인을 다시 돌리고, 결과를 기록 태그(experiences, source=ai)로 저장한다.
// 저장 응답을 보낸 뒤(after) 실행된다. 실패해도 기록 저장에는 영향이 없고, 규칙 태그로 계속 동작한다.

import { hash, isSubjectProject, matchingMode, PARAMS, PIPELINE_VERSION, isKeywordCode, type Tag } from "@/lib/core/index.ts";
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

const keywordsOn = () => !!process.env.OPENAI_API_KEY && matchingMode(process.env.RECORD_MATCHING) !== "rules";

/** 기록이 바뀌었는데 키워드를 아직 다시 정리하지 않은 프로젝트들 */
async function pendingProjects(db: Db, projects?: Awaited<ReturnType<typeof listProjects>>, records?: RecordView[]) {
  const [ps, rs, runs] = await Promise.all([
    projects ?? listProjects(db),
    records ?? listRecords(db),
    db.from("keyword_runs").select("project_id, fingerprint, created_at").order("created_at", { ascending: false }).limit(500),
  ]);
  if (runs.error) throw new Error(runs.error.message);
  const lastPrint = new Map<string, string>();
  for (const r of runs.data) if (r.project_id && !lastPrint.has(r.project_id)) lastPrint.set(r.project_id, r.fingerprint);
  return ps
    .map((p) => ({ project: p, records: rs.filter((r) => r.project_id === p.id) }))
    .map((x) => ({ ...x, print: fingerprint(x.records) }))
    .filter((x) => x.records.length && lastPrint.get(x.project.id) !== x.print)
    // 추천에 쓰이는 팀·개인주제 프로젝트를 먼저 정리한다. 과목·일반 활동은 뒤로 (거캠으로 10개 넘게 들어올 때 추천이 늦게 채워지던 문제, 판단기록 D26)
    .sort((a, b) => Number(isSubjectProject(a.project.title)) - Number(isSubjectProject(b.project.title)));
}

/** 연결 그래프에서 "N개 프로젝트 정리 중" 안내에 쓴다. 이미 읽어 둔 프로젝트·기록을 넘기면 다시 읽지 않는다 */
export async function keywordBacklog(db: Db, projects?: Awaited<ReturnType<typeof listProjects>>, records?: RecordView[]): Promise<number> {
  if (!keywordsOn()) return 0;
  return (await pendingProjects(db, projects, records).catch(() => [])).length;
}

export async function refreshKeywords(db: Db): Promise<{ processed: number; skipped: number }> {
  if (!keywordsOn()) return { processed: 0, skipped: 0 };
  const changed = await pendingProjects(db);

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
export async function afterRecordsChanged(db: Db, userId?: string) {
  // 같은 학생의 정리가 이미 돌고 있으면 건너뛴다 (AI 를 같은 프로젝트에 두 번 부르지 않게)
  //   같은 서버 안: running · 서버가 여러 대(서버리스): profiles.ui_state.kw_lock 시각 (90초 지나면 풀린 것으로 본다)
  if (userId && running.has(userId)) return;
  if (userId && !(await takeLock(db, userId))) return;
  if (userId) running.add(userId);
  let failed = false;
  try {
    await refreshKeywords(db).catch((e) => { failed = true; console.error("키워드 갱신 실패:", e); });
    await recomputeGraph(db).catch((e) => console.error("연결선 재계산 실패:", e));
  } finally {
    if (userId) {
      running.delete(userId);
      // 실패(크레딧 소진·장애)하면 15분 동안 다시 부르지 않는다: 자동 새로고침마다 AI 를 다시 부르지 않게 (D40)
      if (failed) await holdLock(db, userId, FAIL_HOLD_MS).catch(() => {});
      else await releaseLock(db, userId).catch(() => {});
    }
  }
}
const running = new Set<string>();
const LOCK_MS = 90_000;
const FAIL_HOLD_MS = 15 * 60_000;

/** 잠금 시각을 미래로 두어 holdMs 동안 takeLock 이 실패하게 한다 */
async function holdLock(db: Db, userId: string, holdMs: number) {
  const { data } = await db.from("profiles").select("ui_state").eq("id", userId).maybeSingle();
  const state = (data?.ui_state ?? {}) as Record<string, unknown>;
  await db.from("profiles").update({ ui_state: { ...state, kw_lock: Date.now() + holdMs - LOCK_MS } }).eq("id", userId);
}

async function takeLock(db: Db, userId: string): Promise<boolean> {
  const { data } = await db.from("profiles").select("ui_state").eq("id", userId).maybeSingle();
  const state = (data?.ui_state ?? {}) as Record<string, unknown>;
  const at = typeof state.kw_lock === "number" ? state.kw_lock : 0;
  if (Date.now() - at < LOCK_MS) return false;
  const { error } = await db.from("profiles").update({ ui_state: { ...state, kw_lock: Date.now() } }).eq("id", userId);
  return !error;
}

async function releaseLock(db: Db, userId: string) {
  const { data } = await db.from("profiles").select("ui_state").eq("id", userId).maybeSingle();
  const { kw_lock: _, ...rest } = (data?.ui_state ?? {}) as Record<string, unknown>;
  await db.from("profiles").update({ ui_state: rest }).eq("id", userId);
}

