import type { Profile, ProjectTags, Recommendation } from "../types.ts";

// 시험값 (발표 p24)
export const BREADTH = 0.5;
export const DEPTH = 0.5;
/**
 * 점수표 무게 합의 최소값. 칸이 1~2개뿐인 점수표는 그 칸만 맞아도 100점이 되던 문제(판단 E)를 막는다.
 * 무게 합이 이보다 작으면 이 값으로 나눈다. 0 이면 예전과 같다.
 * 6 → 9 (판단기록 D19): 거캠 34명 평가에서 칸 3개짜리 체육학과가 운동 얘기 한 번 + 흔한 "테스트·개선" 으로 9명의 1위가 됐다.
 *   9 에서 3명, 학과 1위 최다 6명, 1위 평균 54점 (12 는 점수가 49 로 너무 낮아지고 학과 쪽 다양성이 줄었다)
 */
export const MIN_TOTAL = 9;

/**
 * 학과·직무 후보 점수: 점수표를 내 프로젝트가 얼마나 채웠는지
 *   넓이 = 모든 프로젝트를 합쳐 채운 가중치 비율 × 100
 *   깊이 = 한 프로젝트가 혼자 채운 최고 비율 × 100
 *   점수 = 0.5 × 넓이 + 0.5 × 깊이
 * 칸을 하나도 채우지 못한 후보는 결과에서 뺀다.
 */
export function scoreProfiles(
  projects: ProjectTags[],
  profiles: Profile[],
  /** minTotal: 분모 최소값 · axisWeight: 칸 무게에 곱할 축 변별력 (lib/core/keywords/axes.ts axisIdf) */
  opts: { minTotal?: number; axisWeight?: (code: string) => number } = {},
): Recommendation[] {
  const round1 = (x: number) => Math.round(x * 10) / 10;
  const out: Recommendation[] = [];

  for (const profile of profiles) {
    // 점수표의 칸마다, 그 칸을 채운 프로젝트와 근거 문장을 모은다
    const cells = Object.entries(profile.weights).map(([tag, w]) => {
      const weight = Math.round(w * (opts.axisWeight?.(tag) ?? 1) * 100) / 100;
      const hits: Record<string, string[]> = {};
      for (const p of projects) {
        const sids = p.tags.get(tag);
        if (sids) hits[p.id] = sids;
      }
      return { tag, weight, hits };
    });

    const total = cells.reduce((s, c) => s + c.weight, 0);
    const filledBy = (projectId?: string) =>
      cells
        .filter((c) => (projectId ? c.hits[projectId] : Object.keys(c.hits).length))
        .reduce((s, c) => s + c.weight, 0);

    const filledAll = filledBy(); // 모든 프로젝트를 합쳐 채운 점수
    if (!total || !filledAll) continue;

    // 혼자 가장 많이 채운 프로젝트
    let best = 0;
    let bestProject: string | null = null;
    for (const p of projects) {
      const own = filledBy(p.id);
      if (own > best) [best, bestProject] = [own, p.id];
    }

    const denom = Math.max(total, opts.minTotal ?? 0);
    const breadth = (100 * filledAll) / denom;
    const depth = (100 * best) / denom;
    out.push({
      profile_id: profile.id,
      score: round1(BREADTH * breadth + DEPTH * depth),
      breadth: round1(breadth),
      depth: round1(depth),
      depth_project_id: bestProject,
      cells,
    });
  }
  return out.sort((a, b) => b.score - a.score);
}
