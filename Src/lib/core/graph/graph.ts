import type { ProjectTags, Relation, TagGroup } from "../types.ts";

// 시험값. 바꾸면 analysis_runs.threshold 와 함께 기록한다.
// 0.18(발표, 규칙 태그 기준) → 0.10 (판단기록 D27): 키워드·공통 축으로 바꾸고 흔한 말을 가볍게 센 뒤, 거캠 학생 34명에서 다시 맞췄다.
//   0.10 이상 = 프로젝트 쌍의 9%, 11/34명이 선 1개 이상. 이 위의 연결은 '식품·먹거리', '접근성·사회문제', '데이터 모델링'처럼 실제 공통점이다.
//   더 낮추면 '피드백·발표'로만 이어진 연결이 섞인다.
export const THRESHOLD = 0.1;

/**
 * 거캠 학생 34명 중 그 코드(키워드·축)를 가진 학생 비율 (20% 이상만, zz_local/keyword-lab/results/*-d27-r1b.md).
 * 거의 모두가 하는 활동(피드백·발표·인터뷰 …)으로 이어진 연결은 공통점이 아니므로 무게를 (1 − 비율) 배로 (최소 0.15).
 */
export const COMMON_LINK_SHARE: Record<string, number> = {
  "A:M11": 0.94, "A:M03": 0.94, "A:M22": 0.94, "K:피드백": 0.85, "A:M23": 0.82, "A:M19": 0.82,
  "A:D04": 0.71, "A:O10": 0.71, "A:O02": 0.71, "K:인터뷰": 0.68, "A:D07": 0.68, "A:M12": 0.65,
  "A:O07": 0.59, "K:개인 주제": 0.53, "A:O09": 0.53, "A:O06": 0.53, "A:M02": 0.5, "K:해커톤": 0.47,
  "A:D08": 0.47, "A:M25": 0.44, "K:프로토타입": 0.44, "K:발표": 0.44, "K:촬영": 0.38, "K:씬랩": 0.38,
  "A:M04": 0.35, "A:D02": 0.35, "A:D09": 0.35, "A:D03": 0.32, "A:D17": 0.32, "A:M14": 0.32,
  "A:O01": 0.29, "A:D06": 0.26, "A:M01": 0.26, "A:T11": 0.26, "A:D22": 0.26, "K:팀 빌딩": 0.26,
  "K:영화관": 0.26, "K:개인 프로젝트": 0.26, "K:청소년": 0.26, "K:발표 연습": 0.26, "A:M18": 0.24, "K:부트캠프": 0.24,
  "K:PPT 발표": 0.24, "K:만들기": 0.24, "A:M17": 0.24, "A:O08": 0.24, "A:D13": 0.21, "A:D10": 0.21,
  "A:D16": 0.21, "A:D01": 0.21, "K:목표 설정": 0.21, "K:영화": 0.21, "K:설문": 0.21,
};
export const linkRarity = (code: string) => Math.max(0.15, 1 - (COMMON_LINK_SHARE[code] ?? 0));
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
  /** 추가 무게 (예: 학생 대부분이 하는 활동은 가볍게. 판단기록 D27). 없으면 1 */
  extraWeight: (code: string) => number = () => 1,
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
    return group * idf * extraWeight(code);
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
