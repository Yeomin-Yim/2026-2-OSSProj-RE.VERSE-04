// 공통 축(2층)의 임베딩. 축 설명은 활성 규칙 사전 + 보충 축에서 만들고, 서버 인스턴스마다 한 번만 임베딩한다.
// "@/..." 경로를 쓰지 않는다 (터미널 스크립트에서도 쓰기 위해).

import { buildAxes, type AxisVec, type RuleDict, type Vec } from "../../core/index.ts";
import { EMBED_DIMENSIONS, EMBED_MODEL } from "../openai.ts";

let cached: { key: string; axes: AxisVec[] } | null = null;

export async function loadAxisVectors(dict: RuleDict, embed: (texts: string[]) => Promise<{ vectors: Vec[] }>): Promise<AxisVec[]> {
  const axes = buildAxes(dict);
  const key = [dict.version, EMBED_MODEL, EMBED_DIMENSIONS, axes.map((a) => a.text).join("|")].join("#");
  if (cached?.key === key) return cached.axes;
  const { vectors } = await embed(axes.map((a) => a.text));
  cached = { key, axes: axes.map((a, i) => ({ code: a.code, label: a.label, vector: vectors[i] })) };
  return cached.axes;
}
