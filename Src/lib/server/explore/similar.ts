// "기록과 닮은" 추천 (판단기록 D34 → D35 로 재설계)
//   실험 결과: 짧은 키워드 하나하나를 학과 원문과 비교하면 글자 모양을 따라간다("비건" → 건축설비과).
//   그래서 ① 프로젝트 하나를 문장으로(제목 + 다룬 것) 임베딩해 ② 프로젝트마다 닮은 학과·직업을 DB 에서 넓게 모으고(catalog_nearest)
//   ③ AI 가 그중 정말 맞는 5곳을 골라 한 줄 이유를 쓴다. 임베딩은 "후보 넓게", AI 는 "정확하게" 역할을 나눈다.
//   결과는 profiles.ui_state.similar 에 저장 → 프로젝트 내용(해시)이 같으면 다시 계산하지 않는다 (임베딩·AI 0회)
import { createHash } from "node:crypto";
import { isKeywordCode, keywordLabel, type ProjectTags } from "@/lib/core/index.ts";
import type { Db } from "../auth";
import { callJson, embedTexts } from "../openai";

export interface SimilarPick { code: string; name: string; reason: string; projects: string[] }
export interface SimilarState { hash: string; at: string; major: SimilarPick[]; job: SimilarPick[]; version: string }
/** 실패 뒤 다시 시도하지 않는 시간. 크레딧 소진·일시 장애 때 자동 새로고침마다 AI 를 다시 부르지 않게 (D40) */
export const SIMILAR_RETRY_MS = 15 * 60 * 1000;
const VERSION = "sim-2";
const PER_PROJECT = 12;
const MAX_CANDIDATES = 30;

export interface ProjectText { id: string; title: string; text: string }

/** 프로젝트 → 임베딩할 문장. 키워드는 자주 나온 순 15개 */
export function projectTexts(projects: { id: string; title: string }[], tags: ProjectTags[]): ProjectText[] {
  const byId = new Map(tags.map((t) => [t.id, t]));
  return projects.flatMap((p) => {
    const t = byId.get(p.id);
    if (!t) return [];
    const kws = [...t.tags].filter(([c]) => isKeywordCode(c)).sort((a, b) => b[1].length - a[1].length).slice(0, 15).map(([c]) => keywordLabel(c));
    return kws.length ? [{ id: p.id, title: p.title, text: `프로젝트: ${p.title}. 다룬 것: ${kws.join(", ")}` }] : [];
  });
}

export const similarHash = (texts: ProjectText[]) =>
  VERSION + ":" + createHash("sha256").update(texts.map((t) => t.text).sort().join("\n")).digest("hex").slice(0, 16);

export async function readSimilar(db: Db, userId: string): Promise<SimilarState | null> {
  const { data } = await db.from("profiles").select("ui_state").eq("id", userId).maybeSingle();
  return ((data?.ui_state ?? {}) as { similar?: SimilarState }).similar ?? null;
}

async function writeSimilar(db: Db, userId: string, patch: Record<string, unknown>) {
  const { data } = await db.from("profiles").select("ui_state").eq("id", userId).maybeSingle();
  const cur = (data?.ui_state ?? {}) as Record<string, unknown>;
  await db.from("profiles").update({ ui_state: { ...cur, ...patch } }).eq("id", userId);
}

/** 최근 실패 시각 (없으면 0) */
export function similarFailedAt(uiState: unknown): number {
  return Number((uiState as { similar_fail_at?: number } | null)?.similar_fail_at ?? 0);
}

interface Candidate { code: string; name: string; summary: string; sim: number; projects: Set<string> }

/** 프로젝트마다 닮은 후보를 모은다 (DB 안에서 계산) */
async function candidates(db: Db, kind: "major" | "job", texts: ProjectText[], vectors: number[][]): Promise<Candidate[]> {
  const all = new Map<string, Candidate>();
  const lists = await Promise.all(vectors.map((v) => db.rpc("catalog_nearest", { q: v.map((x) => Math.round(x * 1e5) / 1e5), k: kind, n: PER_PROJECT })));
  lists.forEach((r, i) => {
    if (r.error) throw new Error(r.error.message);
    for (const c of (r.data ?? []) as { code: string; name: string; summary: string; similarity: number }[]) {
      const cur = all.get(c.code) ?? { code: c.code, name: c.name, summary: c.summary, sim: 0, projects: new Set<string>() };
      cur.sim = Math.max(cur.sim, c.similarity);
      cur.projects.add(texts[i].id);
      all.set(c.code, cur);
    }
  });
  // 여러 프로젝트에 걸친 후보를 조금 앞으로
  return [...all.values()].sort((a, b) => b.sim + 0.02 * b.projects.size - (a.sim + 0.02 * a.projects.size)).slice(0, MAX_CANDIDATES);
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["picks"],
  properties: {
    picks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["code", "reason", "projects"],
        properties: {
          code: { type: "string" },
          reason: { type: "string" },
          projects: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
};

async function choose(kind: "major" | "job", texts: ProjectText[], cands: Candidate[], limit: number): Promise<SimilarPick[]> {
  if (!cands.length) return [];
  const what = kind === "major" ? "대학 학과" : "직업";
  const prompt = [
    `대안학교(거꾸로캠퍼스) 학생의 프로젝트 기록을 보고, 아래 후보 ${what} 중 이 학생에게 정말 어울리는 곳을 최대 ${limit}개 고르세요.`,
    `규칙:`,
    `- 프로젝트에서 실제로 한 일(주제·만든 것·쓴 방법)과 그 ${what}에서 배우거나 하는 일이 분명히 이어지는 곳만. 애매하면 빼고 개수를 줄이세요.`,
    `- 피드백·인터뷰·발표·팀워크처럼 어느 프로젝트에나 있는 활동만으로 고르지 마세요.`,
    `- 서로 거의 같은 곳(예: 컴퓨터공학과·컴퓨터공학부)은 하나만.`,
    `- 여러 프로젝트에 고루 걸치도록 하되, 억지로 채우지 마세요.`,
    `- reason: 학생에게 보여 줄 한 문장(45자 안팎). 반드시 "[프로젝트에서 실제로 한 것]이 [그 ${what}에서 ${kind === "major" ? "배우는 것" : "하는 일"}]과 이어져요" 형태. 프로젝트 이름을 그대로 반복하지 말고 한 일을 쓰세요.`,
    `  예: "비건 정보 웹사이트를 기획·제작한 경험이 웹 서비스 개발 수업과 이어져요"`,
    `- projects: 근거 프로젝트 id. code: 후보의 code 그대로.`,
    ``,
    `[학생 프로젝트]`,
    ...texts.map((t) => `- id=${t.id} | ${t.text}`),
    ``,
    `[후보 ${what}]`,
    ...cands.map((c) => `- code=${c.code} | ${c.name} | ${c.summary.slice(0, 90)}`),
  ].join("\n");
  const { json } = await callJson<{ picks: { code: string; reason: string; projects: string[] }[] }>(`similar_${kind}`, SCHEMA, [{ type: "input_text", text: prompt }], "low");
  const byCode = new Map(cands.map((c) => [c.code, c]));
  const ids = new Set(texts.map((t) => t.id));
  return json.picks
    .filter((p) => byCode.has(p.code))
    .slice(0, limit)
    .map((p) => ({
      code: p.code,
      name: byCode.get(p.code)!.name,
      reason: p.reason.trim().slice(0, 80),
      projects: p.projects.filter((id) => ids.has(id)).length ? p.projects.filter((id) => ids.has(id)) : [...byCode.get(p.code)!.projects],
    }));
}

/** 계산 (임베딩 1번 + AI 2번). 학생 화면에서는 after() 로 뒤에서 돈다 */
export async function computeSimilar(db: Db, texts: ProjectText[], limit = 5): Promise<SimilarState> {
  const { vectors } = await embedTexts(texts.map((t) => t.text));
  const [mc, jc] = await Promise.all([candidates(db, "major", texts, vectors), candidates(db, "job", texts, vectors)]);
  const [major, job] = await Promise.all([choose("major", texts, mc, limit), choose("job", texts, jc, limit)]);
  return { hash: similarHash(texts), at: new Date().toISOString(), major, job, version: VERSION };
}

const running = new Set<string>();
/** 저장된 결과가 지금 기록과 다르면 다시 계산해 저장 (같은 학생은 한 번에 하나만) */
export async function refreshSimilar(db: Db, userId: string, texts: ProjectText[]): Promise<void> {
  if (!texts.length || running.has(userId)) return;
  running.add(userId);
  try {
    const cur = await readSimilar(db, userId);
    if (cur?.hash === similarHash(texts)) return;
    await writeSimilar(db, userId, { similar: await computeSimilar(db, texts), similar_fail_at: null });
  } catch (e) {
    console.warn("기록과 닮은 추천을 만들지 못했어요:", e instanceof Error ? e.message : e);
    await writeSimilar(db, userId, { similar_fail_at: Date.now() }).catch(() => {});
  } finally {
    running.delete(userId);
  }
}
