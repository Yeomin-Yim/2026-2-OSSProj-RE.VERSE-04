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
  // D05(건강·안전)가 "야간 귀가 안전"과 "간호·약학"을 한 축으로 묶어 엉뚱한 추천이 나왔다 (판단기록 D12) → 건강·의료를 따로
  { code: "D22", label: "건강·의료", group: "topic", examples: "건강, 질병, 의료, 병원, 간호, 약, 보건, 환자, 치료 (체육·운동은 스포츠·여가, 미용·메이크업은 문화·예술)" },
];

/** 의미로 붙이는 축에서만 이름·설명을 바꾸는 축 (정규식 사전의 태그 뜻은 그대로) */
export const AXIS_OVERRIDES: Record<string, { label: string; examples: string }> = {
  D05: { label: "안전·위험", examples: "안전, 위험, 범죄, 사고 예방, 재난, 위험 구간, 귀가, 안전 시설" },
};
/**
 * 축 설명 끝에 덧붙이는 경계 (평가 4회차: "체육" → 건강·의료, "메이크업" → 건강·의료 로 잘못 붙음 · 판단기록 D14)
 * 축 목록이 AI 프롬프트에 그대로 들어가므로, 헷갈리는 짝을 설명에 적어 준다
 */
export const AXIS_NOTES: Record<string, string> = {
  D18: " (체육 수업·운동·구기 종목 포함)",
  D07: " (미용·메이크업·패션·그림 포함)",
  M22: " (실제로 만든 것을 시험하고 고친 경우. 단순히 피드백을 받은 것은 아님)",
};
/** 정규식 사전이 D05 로 잡은 말 중 건강·의료 쪽은 D22 로 (힌트용) */
export const HEALTH_WORDS = /건강|의료|질병|병원|간호|약|보건|영양|환자|치료|의약|진료/u;

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
    const o = AXIS_OVERRIDES[code];
    if (o) return { code, label: o.label, group: t.group, text: `${o.label}: ${o.examples}` };
    const words = [...new Set(t.patterns.map(patternWords).filter((w) => w.length >= 2))].slice(0, 12);
    return { code, label: t.label, group: t.group, text: `${t.label}: ${words.join(", ")}${AXIS_NOTES[code] ?? ""}` };
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

/**
 * 축의 변별력 (IDF): 많은 학과·직무 점수표에 들어 있는 축(외부 협업, 소프트웨어 구현 …)은 그 축을 채워도 어느 학과와 특히 맞는지 말해 주지 못한다.
 * 무게 = ln((점수표 수 + 1) / (그 축을 가진 점수표 수 + 1)) + 1. 추천 점수의 칸 무게에 곱한다 (판단기록 D12).
 */
export function axisIdf(profiles: { weights: Record<string, number> }[]): (code: string) => number {
  const df = new Map<string, number>();
  for (const p of profiles) for (const c of Object.keys(p.weights)) df.set(c, (df.get(c) ?? 0) + 1);
  const n = profiles.length;
  const raw = (code: string) => Math.log((n + 1) / ((df.get(code) ?? 0) + 1)) + 1;
  // 평균이 1 이 되게 맞춘다 (무게 합의 크기가 그대로여야 분모 최소값 MIN_TOTAL 이 같은 뜻을 가진다)
  const mean = df.size ? [...df.keys()].reduce((s, c) => s + raw(c), 0) / df.size : 1;
  return (code) => raw(code) / mean;
}

/** 교과 수업 묶음인가 (거캠 기록의 국어·수학·사회 … 묶음은 수업 내용이지 학생 프로젝트가 아니다 → 추천에서 뺀다) */
export const SUBJECT_TITLE = /^(국어|수학|영어|사회|과학|역사|한국사|세계사|체육|음악|미술|기술|가정|기술가정|정보|도덕|윤리|제2외국어|주제중심|교과|일반 ?활동)(\s*수업)?$/u;
export function isSubjectProject(title: string): boolean {
  return SUBJECT_TITLE.test(title.trim());
}

/** 축 코드 검증: 아는 코드만, 중복 없이, 최대 n개 */
/**
 * AI 가 프롬프트 설명을 보고도 되풀이하는 축 실수를 코드로 바로잡는다 (판단기록 D15)
 * - 체육·운동·구기 종목인데 건강 말이 없으면 건강·의료(D22) 를 떼고 스포츠·여가(D18) 로
 * - 미용·메이크업·패션은 건강·의료가 아니라 문화·예술(D07)
 * 키워드 글자만 보므로, DB 에 이미 고정된 축에도 읽을 때 적용된다
 */
const SPORT_WORDS = /체육|운동|농구|축구|배구|야구|스포츠|달리기|몸풀기|헬스/u;
const MEDICAL_SAFETY = /의약|약물|약사|한약|약학|약품|복약|투약|건강|의료|질병|병원|간호|보건|영양|환자|치료|위생|식중독|감염/u;
const BEAUTY_WORDS = /메이크업|화장|미용|뷰티|패션|네일/u;
const PROTOTYPE_WORDS = /프로토타입|시제품|목업|모형/u;
const SOFTWARE_WORDS = /앱|어플|웹|사이트|홈페이지|코딩|코드|소프트웨어|프로그램|프로그래밍|게임|로블록스|프롬프트|AI|인공지능|챗봇|자동화/iu;
/** 학교 수업 이름 그 자체 ("체육", "체육 시간"): 매주 하는 수업이라 관심이나 경험을 말해 주지 않는다 (34명 평가에서 체육학과가 9명의 1위) */
const CLASS_NAME = /^(체육|음악|미술)(\s*(수업|시간|활동))?$/u;
export function guardAxes(keyword: string, axes: string[]): string[] {
  if (CLASS_NAME.test(keyword.trim())) return [];
  // "프로토타입 제작"은 거캠 학생 대부분이 하는 종이·실물 시제품이다. 소프트웨어 말이 없으면 소프트웨어 축(O06·M17) 대신 실물 시제품(O09)
  if (PROTOTYPE_WORDS.test(keyword) && !SOFTWARE_WORDS.test(keyword) && (axes.includes("O06") || axes.includes("M17"))) {
    axes = [...new Set([...axes.filter((a) => a !== "O06" && a !== "M17"), "O09"])];
  }
  if (!axes.includes("D22") && !axes.includes("D05")) return axes;
  const swap = (to: string) => [...new Set(axes.map((a) => (a === "D22" || a === "D05" ? to : a)))];
  if (BEAUTY_WORDS.test(keyword)) return swap("D07");
  // 의약품·식품·위생의 "안전"은 생활 안전(D05)이 아니라 건강·의료 (약사·영양사가 야간 귀가 안전과 이어지던 문제, D17)
  if (axes.includes("D05") && MEDICAL_SAFETY.test(keyword)) return [...new Set(axes.map((a) => (a === "D05" ? "D22" : a)))];
  if (SPORT_WORDS.test(keyword) && !HEALTH_WORDS.test(keyword)) return swap("D18");
  return axes;
}

export function cleanAxes(codes: unknown, known: Set<string>, n = 3): string[] {
  if (!Array.isArray(codes)) return [];
  return [...new Set(codes.filter((c): c is string => typeof c === "string").map((c) => c.trim().toUpperCase()).filter((c) => known.has(c)))].slice(0, n);
}

/**
 * 관심 있을 만한 것 (판단기록 D14): 주제 축만으로, 두 방향을 함께 본다.
 *   덮음(R) = 내가 다뤄 온 주제 무게 중 이 학과·직무가 가진 몫     ← "내 관심을 얼마나 덮나"
 *   채움(P) = 이 학과·직무의 주제 무게 중 내가 다뤄 본 몫         ← "이 학과의 주제를 얼마나 해 봤나"
 *   점수 = 2PR/(P+R) × 100  (한쪽만 높으면 낮다: 주제 칸이 하나뿐인 학과가 그 하나로 100점이 되지 않는다)
 * 내 주제 무게 = 그 주제를 다룬 프로젝트 수 × 변별력
 */
export function interestScores(
  mine: Map<string, number>,
  profiles: { id: string; weights: Record<string, number> }[],
  idf: (code: string) => number = () => 1,
): { profile_id: string; score: number; matched: string[] }[] {
  const myTotal = [...mine].reduce((s, [c, n]) => s + n * idf(c), 0);
  if (!myTotal) return [];
  return profiles
    .map((p) => {
      const entries = Object.entries(p.weights);
      const pTotal = entries.reduce((s, [c, w]) => s + w * idf(c), 0);
      const hit = entries.filter(([c]) => mine.has(c));
      if (!pTotal || !hit.length) return null;
      const P = hit.reduce((s, [c, w]) => s + w * idf(c), 0) / pTotal;
      const R = hit.reduce((s, [c]) => s + mine.get(c)! * idf(c), 0) / myTotal;
      return { profile_id: p.id, score: Math.round(1000 * (2 * P * R) / (P + R)) / 10, matched: hit.sort((a, b) => b[1] - a[1]).map(([c]) => c) };
    })
    .filter((x): x is { profile_id: string; score: number; matched: string[] } => !!x)
    .sort((a, b) => b.score - a.score);
}

/**
 * 학생들 사이에서 흔한 축 (판단기록 D14): 거캠 학생 대부분이 하는 활동(피드백 받기, 이해관계자 맵핑 …)은 "많이 해 온 것"에서
 * 그 학생만의 경험을 가린다. 학생 집단에서 그 축을 가진 학생 비율 f 로, 학과·직무 점수표의 그 칸 무게를 (1 - f) 배 (최소 0.15) 로 줄인다.
 * 분자·분모 모두에 들어가므로 순위만 바꾸고 점수 크기는 무너뜨리지 않는다.
 * shares: 축 → 학생 비율 (평가에서 계산해 COMMON_AXIS_SHARE 로 둔다)
 */
export function rarityAmongStudents(shares: Record<string, number>): (code: string) => number {
  return (code) => Math.max(0.15, 1 - (shares[code] ?? 0));
}
