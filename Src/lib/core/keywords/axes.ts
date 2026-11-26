// 2층: 공통 축. 학생 기록과 학과·직무 설명을 잇는 고정된 다리.
// 자유 키워드(1층)는 학생마다·학과마다 말이 달라 직접 맞지 않는다 (평가: 학생↔학과 키워드 유사도 대부분 0.3~0.5).
// 그래서 키워드를 고정된 축(규칙 사전 v0.5 의 66개 + 보충 3개)에 붙이고, 추천은 축으로 계산한다.
// 축을 붙이는 방법은 정규식이 아니라 의미: 임베딩으로 후보를 고르고 AI 가 확정, 결과는 키워드 사전에 저장해 다시 쓴다.

import type { RuleDict, TagGroup } from "../types.ts";
import { cosine, type Vec } from "./select.ts";

export const AXIS_PREFIX = "A:";
export const axisCode = (code: string) => AXIS_PREFIX + code;
export const isAxisCode = (code: string) => code.startsWith(AXIS_PREFIX);
export const axisOf = (code: string) => (isAxisCode(code) ? code.slice(AXIS_PREFIX.length) : code);

export interface Axis {
  code: string;
  label: string;
  group: TagGroup;
  /** 임베딩할 설명: 이름 + 예시 말 */
  text: string;
}

/** 규칙 사전에 없던 영역 (학과·직무 원문에서 사전 공백으로 나온 것: 점수표_검토용 unmapped_concepts) */
export const EXTRA_AXES: { code: string; label: string; group: TagGroup; examples: string }[] = [
  { code: "D19", label: "정보보안", group: "topic", examples: "해킹, 보안, 암호, 개인정보 보호, 바이러스, 침입 탐지, 방화벽" },
  { code: "D20", label: "네트워크·통신", group: "topic", examples: "네트워크, 통신, 인터넷, 서버, 클라우드, 프로토콜, 무선 통신" },
  { code: "D21", label: "수학·이론", group: "topic", examples: "수학, 증명, 대수학, 확률, 방정식, 수리 논리, 이론 탐구" },
];

/** 정규식 패턴 → 예시 말 ("설문 ?(조사|문항)" → "설문 조사 문항") */
export function patternWords(p: string): string {
  return p
    .replace(/\(\?<?[!=][^)]*\)/g, " ") // 전방·후방 탐색
    .replace(/\\[bdswBDSW]\+?/g, " ")
    .replace(/\[[^\]]*\](\{[^}]*\})?/g, " ")
    .replace(/\{[^}]*\}/g, " ")
    .replace(/[()|?*+^$\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildAxes(dict: RuleDict): Axis[] {
  const fromDict = Object.entries(dict.tags).map(([code, t]) => {
    const words = [...new Set(t.patterns.map(patternWords).filter((w) => w.length >= 2))].slice(0, 12);
    return { code, label: t.label, group: t.group, text: `${t.label}: ${words.join(", ")}` };
  });
  const extra = EXTRA_AXES.filter((a) => !dict.tags[a.code]).map((a) => ({ code: a.code, label: a.label, group: a.group, text: `${a.label}: ${a.examples}` }));
  return [...fromDict, ...extra];
}

export interface AxisVec {
  code: string;
  label: string;
  vector: Vec;
  /** 축 설명 (이름: 예시 말). AI 프롬프트의 축 목록에 쓴다 */
  text?: string;
}

/**
 * 축 후보 = 사전 예시 힌트(앞) + 임베딩 상위 k 개. 힌트는 규칙 사전의 예시 말이 키워드에 들어 있는 축이다
 * (예: "다회용컵" ← 환경·기후·생태 의 예시 "다회용"). 정규식으로 확정하지 않고 AI 에 ★ 로 알려 주기만 한다.
 */
export function axisCandidates(v: Vec, axes: AxisVec[], hints: string[], k = 5, max = 7): string[] {
  const known = new Set(axes.map((a) => a.code));
  return [...new Set([...hints.filter((h) => known.has(h)), ...proposeAxes(v, axes, k).map((a) => a.code)])].slice(0, max);
}

/** 키워드에 어울리는 축 후보 (임베딩 유사도 순). AI 에 보여 줄 후보를 고르는 데 쓴다 */
export function proposeAxes(v: Vec, axes: AxisVec[], k = 5, min = 0.2): { code: string; label: string; sim: number }[] {
  return axes
    .map((a) => ({ code: a.code, label: a.label, sim: cosine(v, a.vector) }))
    .filter((a) => a.sim >= min)
    .sort((a, b) => b.sim - a.sim)
    .slice(0, k);
}

/** 축 코드 검증: 아는 코드만, 중복 없이, 최대 n개 */
export function cleanAxes(codes: unknown, known: Set<string>, n = 3): string[] {
  if (!Array.isArray(codes)) return [];
  return [...new Set(codes.filter((c): c is string => typeof c === "string").map((c) => c.trim().toUpperCase()).filter((c) => known.has(c)))].slice(0, n);
}
