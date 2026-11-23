import type { ProjectTags, Relation, TagGroup } from "../types.ts";

// 시험값. 바꾸면 analysis_runs.threshold 와 함께 기록한다.
export const THRESHOLD = 0.18;
export const GROUP_WEIGHT: Record<TagGroup, number> = { method: 1.0, output: 0.9, topic: 0.7, tool: 0.4 };

/**
 * 프로젝트 연결: IDF 가중 자카드 (발표 p23)
 *   태그 무게   = 그룹 가중치 × [ ln((N+1)/(df+1)) + 1 ]   … 드문 태그일수록 무겁다
 *   닮은 정도   = 함께 가진 태그의 무게 합 ÷ 두 프로젝트 모든 태그의 무게 합
 * 겹치는 태그가 있는 쌍을 점수순으로 돌려준다. 화면은 THRESHOLD 이상만 그린다.
 */
export function computeRelations(
  projects: ProjectTags[],
  groupOf: (code: string) => TagGroup | undefined,
): Relation[] {
  const N = projects.length;

  // df: 그 태그가 나온 프로젝트 수
  const df = new Map<string, number>();
  for (const p of projects) {
    for (const code of p.tags.keys()) df.set(code, (df.get(code) ?? 0) + 1);
  }

  const weight = (code: string) => {
    const group = GROUP_WEIGHT[groupOf(code) ?? "topic"];
    const idf = Math.log((N + 1) / ((df.get(code) ?? 0) + 1)) + 1;
    return group * idf;
  };
  const sum = (codes: Iterable<string>) => [...codes].reduce((s, c) => s + weight(c), 0);

  const relations: Relation[] = [];
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      const A = projects[i];
      const B = projects[j];

      const shared = [...A.tags.keys()].filter((c) => B.tags.has(c));
      if (!shared.length) continue;
      const union = new Set([...A.tags.keys(), ...B.tags.keys()]);

      shared.sort((x, y) => weight(y) - weight(x)); // 무거운 태그부터
      relations.push({
        a: A.id,
        b: B.id,
        score: Math.round((sum(shared) / sum(union)) * 1000) / 1000,
        shared,
        evidence: {
          [A.id]: shared.flatMap((c) => A.tags.get(c) ?? []),
          [B.id]: shared.flatMap((c) => B.tags.get(c) ?? []),
        },
      });
    }
  }
  return relations.sort((x, y) => y.score - x.score);
}
