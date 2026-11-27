import { interestScores, rarityAmongStudents } from "../keywords/axes.ts";
import type { Profile, ProjectTags } from "../types.ts";
import { MIN_TOTAL, scoreProfiles } from "./recommend.ts";

/**
 * 추천 관점 4가지 (판단기록 D11~D15). 학생은 자기 진로를 모르므로 한 가지 점수로 줄 세우지 않고 여러 이유로 보여 준다.
 *   overall  종합         지금 점수 (넓이·깊이)
 *   repeated 많이 해 온 것 활동·결과물·도구 축(M·O·T)만. 여러 프로젝트에서 되풀이한 활동일수록 높다.
 *                         거캠 학생 대부분이 하는 활동(발표, 피드백 …)은 점수표 칸 무게를 줄인다 (COMMON_AXIS_SHARE)
 *   deep     깊게 해 본 것 한 프로젝트가 혼자 채운 깊이 순
 *   interest 관심 있을 만한 것 주제 축(D)만. 스스로 고른 개인주제 프로젝트가 있으면 그것 기준 (interestScores, F1)
 * 축 코드는 접두사 없는 코드(D07, M22 …): forRecommend 를 거친 태그
 */
/** 점수표(축 무게)로 계산하는 관점 */
export type AxisLensKey = "overall" | "repeated" | "deep" | "interest";
/** similar = 커리어넷 전체에서 임베딩으로 모으고 AI 가 고른 "기록과 닮은" (lib/server/explore/similar.ts, 판단기록 D35) */
export type LensKey = AxisLensKey | "similar";
export const LENS_LABEL: Record<LensKey, string> = {
  overall: "종합",
  similar: "기록과 닮은",
  repeated: "많이 해 온 것",
  deep: "깊게 해 본 것",
  interest: "관심 있을 만한 것",
};

/**
 * 거캠 학생 34명(2학기) 평가에서 잰 "그 축을 가진 학생 비율" (zz_local/keyword-lab/results/*-d19b.md, 활동·결과물·도구 축만).
 * 앱에서는 다른 학생 기록을 볼 수 없으므로(RLS) 평가값을 고정해 쓴다. 학생이 늘면 평가를 다시 돌려 갱신.
 */
export const COMMON_AXIS_SHARE: Record<string, number> = {
  M22: 0.91, M03: 0.88, M23: 0.85, M19: 0.79, M11: 0.71, O02: 0.65, M12: 0.59, O07: 0.59,
  O09: 0.5, O10: 0.5, M01: 0.41, M02: 0.35, M04: 0.32,
};

export const isTopicAxis = (code: string) => code.startsWith("D");
export const SELF_CHOSEN = /개주프|개인\s?주제|개인\s?성장/u;

/**
 * 주제가 하나도 안 겹치는 추천은 낮춘다 (판단기록 D17).
 * 활동 축 하나(테스트·개선, 실험·측정 …)만으로 간호학과·약사 같은 학과·직무가 2~3위에 오던 문제.
 * 점수표에 주제 칸이 있는데 내 기록이 그중 하나도 채우지 못하면 점수 × OFF_TOPIC. 점수표에 주제 칸이 없으면 그대로.
 */
export const OFF_TOPIC = 0.7;
/** 주제라기보다 공부 방식에 가까운 축은 감점 판단에서 뺀다: D21 수학·이론 (통계학과·수학과의 주제 칸이 이것뿐이라 억울하게 깎였다) */
const FIT_EXCLUDE = new Set(["D21"]);
type Scored = ReturnType<typeof scoreProfiles>[number];
export function topicFit<T extends Scored>(rs: T[], key: "score" | "depth" = "score"): T[] {
  return rs
    .map((r) => {
      const topics = r.cells.filter((c) => isTopicAxis(c.tag) && !FIT_EXCLUDE.has(c.tag));
      const off = topics.length > 0 && !topics.some((c) => Object.keys(c.hits).length);
      return off ? { ...r, [key]: Math.round(r[key] * OFF_TOPIC * 10) / 10, offTopic: true } : r;
    })
    .sort((a, b) => b[key] - a[key]);
}

export interface LensResult {
  profile_id: string;
  score: number;
  /** 채운 칸(축 코드), 무게 큰 순 */
  matched: string[];
  /** 근거 프로젝트 id, 기여 큰 순 */
  evidence: string[];
  breadth?: number;
  depth?: number;
}

const only = (w: Record<string, number>, keep: (c: string) => boolean) =>
  Object.fromEntries(Object.entries(w).filter(([c]) => keep(c)));

function evidenceFor(projects: ProjectTags[], codes: string[]): string[] {
  const n = new Map<string, number>();
  codes.forEach((c, i) => {
    for (const p of projects) if (p.tags.has(c)) n.set(p.id, (n.get(p.id) ?? 0) + (codes.length - i));
  });
  return [...n].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}

export function lensScores(
  projects: ProjectTags[],
  profiles: Profile[],
  opts: { idf?: (code: string) => number; selfChosen?: Set<string>; shares?: Record<string, number>; max?: number } = {},
): Record<AxisLensKey, LensResult[]> {
  const idf = opts.idf ?? (() => 1);
  const rare = rarityAmongStudents(opts.shares ?? COMMON_AXIS_SHARE);
  const max = opts.max ?? 5;
  const isDoing = (c: string) => !isTopicAxis(c);

  // 종합·깊게: 흔한 활동(테스트·개선, 발표 …)은 덜 센다. 주제 축은 그대로 (D19: 34명에서 1위 쏠림이 줄었다)
  const scored = scoreProfiles(projects, profiles, { minTotal: MIN_TOTAL, axisWeight: (c) => idf(c) * (isTopicAxis(c) ? 1 : rare(c)) });
  const all = topicFit(scored);
  const fromScore = (rs: typeof all, key: "score" | "depth"): LensResult[] =>
    rs.slice(0, max).map((r) => {
      const matched = r.cells.filter((c) => Object.keys(c.hits).length).sort((a, b) => b.weight - a.weight).map((c) => c.tag);
      const contrib = new Map<string, number>();
      for (const c of r.cells) for (const pid of Object.keys(c.hits)) contrib.set(pid, (contrib.get(pid) ?? 0) + c.weight);
      return { profile_id: r.profile_id, score: r[key], matched, evidence: [...contrib].sort((a, b) => b[1] - a[1]).map(([id]) => id), breadth: r.breadth, depth: r.depth };
    });

  // 많이 해 온 것: 칸마다 (무게 × 변별력 × 흔하지 않음) 를 그 축을 가진 내 프로젝트 수(최대 3)/3 만큼 채운다
  const count = new Map<string, number>();
  for (const p of projects) for (const c of p.tags.keys()) if (isDoing(c)) count.set(c, (count.get(c) ?? 0) + 1);
  const repeated = profiles
    .map((p) => {
      const cells = Object.entries(only(p.weights, isDoing)).map(([c, w]) => ({ c, w: w * idf(c) * rare(c), k: Math.min(count.get(c) ?? 0, 3) / 3 }));
      const total = Math.max(cells.reduce((s, x) => s + x.w, 0), MIN_TOTAL / 2);
      const matched = cells.filter((x) => x.k > 0).sort((a, b) => b.w * b.k - a.w * a.k).map((x) => x.c);
      return { profile_id: p.id, score: Math.round((1000 * cells.reduce((s, x) => s + x.w * x.k, 0)) / total) / 10, matched, evidence: evidenceFor(projects, matched) };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, max);

  // 관심: 개인주제 프로젝트(있으면) 의 주제 축
  const own = projects.filter((p) => opts.selfChosen?.has(p.id));
  const base = own.length ? own : projects;
  const topics = new Map<string, number>();
  for (const p of base) for (const c of p.tags.keys()) if (isTopicAxis(c)) topics.set(c, (topics.get(c) ?? 0) + 1);
  const interest = interestScores(topics, profiles.map((p) => ({ id: p.id, weights: only(p.weights, isTopicAxis) })), idf)
    .slice(0, max)
    .map((r) => ({ ...r, evidence: evidenceFor(base, r.matched) }));

  return {
    overall: fromScore(all, "score"),
    repeated,
    deep: fromScore(topicFit(scored, "depth"), "depth"),
    interest,
  };
}
