// 비슷한 키워드도 맞은 것으로 보기 (추천 계산 전).
// 학생 키워드와 점수표 키워드가 이름은 달라도 임베딩이 충분히 가까우면("급식 데이터 분석" ↔ "데이터 분석"),
// 학생 프로젝트가 그 점수표 칸도 채운 것으로 본다. 근거 문장은 학생 키워드의 문장을 그대로 쓴다.

import type { ProjectTags } from "../types.ts";
import { isKeywordCode, keywordLabel } from "./resolve.ts";
import { cosine, type Vec } from "./select.ts";

/** 시험값: 이 이상 가까우면 비슷한 키워드로 본다 (같은 키워드로 합치는 기준 0.9 보다 느슨하게) */
export const RELATED_AS = 0.8;

export function expandRelated(
  projects: ProjectTags[],
  targetCodes: Iterable<string>,
  vectorOf: (canonical: string) => Vec | undefined,
  threshold = RELATED_AS,
  /** 비슷해서 채운 칸마다 불린다: 어느 프로젝트의 어떤 내 키워드가 점수표의 어떤 키워드를 채웠나 (화면 근거 표시용) */
  onMatch?: (m: { project: string; target: string; source: string; sim: number }) => void,
): ProjectTags[] {
  const targets = [...new Set(targetCodes)].filter(isKeywordCode).map((code) => ({ code, v: vectorOf(keywordLabel(code)) })).filter((t) => t.v);
  const sim = new Map<string, number>();
  const similarity = (a: string, va: Vec, b: string, vb: Vec) => {
    const key = a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`;
    if (!sim.has(key)) sim.set(key, cosine(va, vb));
    return sim.get(key)!;
  };

  return projects.map((p) => {
    const tags = new Map(p.tags);
    for (const [code, sids] of p.tags) {
      if (!isKeywordCode(code)) continue;
      const v = vectorOf(keywordLabel(code));
      if (!v) continue;
      for (const t of targets) {
        if (t.code === code || p.tags.has(t.code)) continue;
        const sim = similarity(code, v, t.code, t.v!);
        if (sim >= threshold) {
          onMatch?.({ project: p.id, target: t.code, source: code, sim });
          const cur = tags.get(t.code) ?? [];
          tags.set(t.code, [...new Set([...cur, ...sids])]);
        }
      }
    }
    return { id: p.id, tags };
  });
}
