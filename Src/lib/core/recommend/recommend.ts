import type { Profile, ProjectTags, Recommendation } from "../types.ts";

// 시험값 (발표 p24)
export const BREADTH = 0.5;
export const DEPTH = 0.5;
/**
 * 점수표 무게 합의 최소값. 칸이 1~2개뿐인 점수표는 그 칸만 맞아도 100점이 되던 문제(판단 E)를 막는다.
 * 무게 합이 이보다 작으면 이 값으로 나눈다 (중간 중요도 3칸 = 6 에 해당). 0 이면 예전과 같다.
 */
export const MIN_TOTAL = 6;

/**
 * 학과·직무 후보 점수: 점수표를 내 프로젝트가 얼마나 채웠는지
 *   넓이 = 모든 프로젝트를 합쳐 채운 가중치 비율 × 100
 *   깊이 = 한 프로젝트가 혼자 채운 최고 비율 × 100
 *   점수 = 0.5 × 넓이 + 0.5 × 깊이
 * 칸을 하나도 채우지 못한 후보는 결과에서 뺀다.
 */
export function scoreProfiles(projects: ProjectTags[], profiles: Profile[], opts: { minTotal?: number } = {}): Recommendation[] {
  const round1 = (x: number) => Math.round(x * 10) / 10;
  const out: Recommendation[] = [];

  for (const profile of profiles) {
    // 점수표의 칸마다, 그 칸을 채운 프로젝트와 근거 문장을 모은다
    const cells = Object.entries(profile.weights).map(([tag, weight]) => {
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
