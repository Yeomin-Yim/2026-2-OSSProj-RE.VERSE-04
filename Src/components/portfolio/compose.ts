// 포트폴리오 자동 초안 조합 (화면 전용 순수 계산, 결정 D005·D006)
//
// 서버·DB 는 바꾸지 않는다. 기존 저장 구조 portfolios.content(jsonb)에 키만 더 쓴다.
//   content[project_id] = {
//     problem · role · result     ← 기존 키. 간단형의 "문제와 목표 · 나의 역할 · 결과와 배움"으로 그대로 쓴다 (예전에 저장한 글 유지)
//     intro · process             ← 간단형 추가 항목
//     d_*                         ← 상세형 9항목 (증빙자료는 evidence 로 따로)
//     evidence                    ← 고른 증빙 자료(기록) id
//     cover                       ← 대표 이미지로 쓸 사진 기록 id ("" = 쓰지 않음)
//     _src                        ← 항목마다 글의 출처 (AI 초안 / 개요 / 기록 발췌 / 직접 수정 …)
//   }
//   content._meta = { variant: "simple" | "detailed" }
//
// 항목을 채우는 순서: [AI 초안(근거 문장 검증됨) → 개요(학생 확인값) → 기록 원문에서 표현이 맞는 문장 그대로 발췌].
// 발췌는 문장을 고치지 않고 옮기기만 한다. 아무 근거도 없으면 비워 두고 화면이 "추가 확인 필요"를 보여 준다.
// 이미 값이 있는 항목(빈 문자열 포함 — 학생이 지운 것)은 절대 덮어쓰지 않는다.

import { splitText, type PortfolioSource } from "../../lib/core/index.ts";

export type Variant = "simple" | "detailed";
export type Origin = "ai" | "overview" | "record" | "info" | "simple" | "edited";

export const SIMPLE_KEYS = ["intro", "problem", "role", "process", "result"] as const;
export const DETAILED_KEYS = ["d_problem", "d_role", "d_process", "d_trial", "d_feedback", "d_result", "d_learning", "d_next"] as const;
export type SecKey = (typeof SIMPLE_KEYS)[number] | (typeof DETAILED_KEYS)[number];

export type ProjectContent = Partial<Record<SecKey, string>> & {
  evidence?: string[];
  cover?: string;
  _src?: Partial<Record<SecKey, Origin>>;
};
export type ContentMap = Record<string, ProjectContent>;
export const META = "_meta";

export interface SectionDef {
  key: SecKey;
  no: string;
  label: string;
  guide: string;
  /** 권장 분량 (넘어도 저장은 된다. 카운터 색만 바뀐다) */
  soft: number;
  rows: number;
  single?: boolean;
}

export const SIMPLE_SECTIONS: SectionDef[] = [
  { key: "intro", no: "", label: "프로젝트 한 줄 소개", guide: "이 프로젝트를 한 문장으로 소개해요.", soft: 80, rows: 2, single: true },
  { key: "problem", no: "2", label: "문제와 목표", guide: "어떤 문제를 해결하려 했나요?", soft: 300, rows: 5 },
  { key: "role", no: "3", label: "나의 역할", guide: "어떤 활동을 담당했고, 실제로 기여한 부분은 무엇인가요?", soft: 300, rows: 5 },
  { key: "process", no: "4", label: "실행 과정", guide: "어떤 방식으로 프로젝트를 진행했나요?", soft: 300, rows: 5 },
  { key: "result", no: "5", label: "결과와 배움", guide: "무엇을 만들거나 달성했고, 무엇을 배우고 성장했나요?", soft: 350, rows: 6 },
];

export const DETAILED_SECTIONS: SectionDef[] = [
  { key: "d_problem", no: "1", label: "프로젝트 배경과 문제 정의", guide: "프로젝트를 시작한 계기와 해결하려던 문제를 적어요.", soft: 500, rows: 6 },
  { key: "d_role", no: "2", label: "나의 역할과 구체적인 기여", guide: "팀 전체가 아니라 내가 맡고 직접 한 일이 드러나게 적어요.", soft: 500, rows: 6 },
  { key: "d_process", no: "3", label: "탐구 및 실행 과정", guide: "조사·인터뷰·제작 등 진행한 순서대로 적어요.", soft: 600, rows: 7 },
  { key: "d_trial", no: "4", label: "시행착오와 문제 해결", guide: "막혔던 지점과 어떻게 바꿔서 해결했는지 적어요.", soft: 500, rows: 6 },
  { key: "d_feedback", no: "5", label: "피드백 및 수정 과정", guide: "받은 의견과 그에 따라 고친 점을 적어요.", soft: 500, rows: 6 },
  { key: "d_result", no: "6", label: "프로젝트 결과와 성과", guide: "만든 결과물과 달라진 점을 기록에 있는 사실로 적어요.", soft: 500, rows: 6 },
  { key: "d_learning", no: "8", label: "배움과 성장", guide: "이 프로젝트로 배운 점과 달라진 생각을 적어요.", soft: 500, rows: 6 },
  { key: "d_next", no: "9", label: "향후 발전 방향", guide: "아쉬웠던 점과 다음에 해 보고 싶은 개선을 적어요.", soft: 400, rows: 5 },
];
/** 상세형 7번(증빙자료)은 글이 아니라 자료 선택이라 따로 그린다 */
export const EVIDENCE_NO = "7";

export const sectionsFor = (v: Variant) => (v === "simple" ? SIMPLE_SECTIONS : DETAILED_SECTIONS);
export const keysFor = (v: Variant): readonly SecKey[] => (v === "simple" ? SIMPLE_KEYS : DETAILED_KEYS);

export const ORIGIN_LABEL: Record<Origin, string> = {
  ai: "AI 초안",
  overview: "개요에서 옮김",
  record: "기록에서 발췌",
  info: "프로젝트 정보",
  simple: "간단형 글에서 옮김",
  edited: "직접 수정함",
};
export const ORIGIN_HINT: Record<Origin, string> = {
  ai: "기록 문장을 근거로 AI가 쓴 초안이에요. 근거 문장이 실제로 있는지 코드가 확인했어요.",
  overview: "프로젝트 관리 → 개요에 정리된 글을 그대로 옮겼어요.",
  record: "기록 원문에서 이 항목과 맞는 문장을 고치지 않고 옮겼어요. 읽기 좋게 다듬어 주세요.",
  info: "프로젝트 주제(정보)를 그대로 옮겼어요.",
  simple: "간단형에 쓴 글을 옮겼어요.",
  edited: "직접 고친 글이에요. 다시 채우기를 해도 바뀌지 않아요.",
};

/** AI 초안 3섹션의 글 (draftProject 결과에서 text 만) */
export interface AiTexts { problem?: string; role?: string; result?: string }

// 기록 문장 발췌에 쓰는 표현 (lib/core/projects/checks.ts KW 와 같은 계열, 항목별로 조금 넓힘)
const RE = {
  problem: /문제|불편|어려움|계기|왜 |필요성|해결하고/u,
  role: /내가|제가|맡았|맡아|맡은|담당|역할|직접/u,
  process: /인터뷰|조사|관찰|설문|시도|제작|분석|실험|진행했|만들었|만들어|정리했/u,
  trial: /어려웠|어려움|실패|막혔|막히|오류|안 됐|안됐|잘 안|문제가 생|문제였|해결했|해결하|바꿨|바꾸었|다시 /u,
  feedback: /피드백|의견|조언|코멘트|반응|지적|질문을 받|반영|수정했|고쳤/u,
  result: /완성|결과|시안|발표|달라졌|변화|만들었|개선됐|줄었|늘었/u,
  learning: /배운|배웠|느낀|느꼈|깨달|성장|알게 되/u,
  next: /다음에|다음엔|다음에는|앞으로|보완|개선하고|아쉬|더 해 보|해보고 싶/u,
} as const;

const MIN_SENT = 8;
const MAX_SENT = 300;
const norm = (s: string) => s.replace(/\s+/g, " ").trim();
const firstSentence = (t: string | undefined) => (t ? splitText(t)[0] ?? "" : "");

/** 기록 원문에서 표현이 맞는 문장을 그대로 고른다 (같은 문장은 한 번만, 최대 max 개) */
export function pickSentences(records: PortfolioSource["records"], re: RegExp, used: Set<string>, max = 3): string[] {
  const out: string[] = [];
  for (const r of records) {
    for (const s of splitText(r.text || "")) {
      if (out.length >= max) return out;
      const t = norm(s), key = t;
      if (t.length < MIN_SENT || t.length > MAX_SENT || used.has(key) || !re.test(t)) continue;
      used.add(key);
      out.push(t);
    }
  }
  return out;
}

type Cand = () => [string, Origin] | null;
const txt = (v: string | undefined, o: Origin): Cand => () => (v && v.trim() ? [v.trim(), o] : null);
const joinOv = (o: Record<string, string>, keys: string[]): string =>
  keys.map((k) => (o[k] ?? "").trim()).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join("\n\n");

/**
 * 한 형식(간단형/상세형)의 빈 항목을 채운다. 이미 키가 있는 항목은 건드리지 않는다.
 *   ai    : 이번에 받은 AI 초안 (없으면 null)
 *   prior : AI 대신 쓸 이전 글 (상세형을 처음 열 때 간단형에 써 둔 problem·role·result) — 출처는 "simple"
 */
export function fillMissing(
  current: ProjectContent | undefined,
  source: PortfolioSource,
  variant: Variant,
  opts: { ai?: AiTexts | null; prior?: AiTexts | null } = {},
): ProjectContent {
  const cur: ProjectContent = { ...(current ?? {}), _src: { ...(current?._src ?? {}) } };
  const o = source.overview ?? {};
  const ai = opts.ai ?? {};
  const prior = opts.prior ?? {};
  // 이미 들어 있는 글의 문장은 다시 발췌하지 않는다 (같은 문장이 두 항목에 들어가지 않게)
  const used = new Set<string>();
  for (const k of [...SIMPLE_KEYS, ...DETAILED_KEYS]) for (const s of splitText(cur[k] ?? "")) used.add(norm(s));
  // 여러 표현 묶음을 차례로 찾아 합친다 (예: 결과와 배움 = 결과 2문장 + 배움 2문장)
  const rec = (...res: RegExp[]): Cand => () => {
    const got = res.flatMap((re) => pickSentences(source.records, re, used, res.length > 1 ? 2 : 3));
    return got.length ? [got.join("\n"), "record"] : null;
  };

  const plan: Partial<Record<SecKey, Cand[]>> = variant === "simple"
    ? {
        intro: [txt(source.topic ?? "", "info"), txt(firstSentence(o.activity), "overview"), txt(firstSentence(o.problem), "overview")],
        problem: [txt(ai.problem, "ai"), txt(o.problem, "overview"), rec(RE.problem)],
        role: [txt(ai.role, "ai"), txt(joinOv(o, ["role", "activity"]), "overview"), rec(RE.role)],
        process: [txt(o.process, "overview"), rec(RE.process)],
        result: [txt(ai.result, "ai"), txt(joinOv(o, ["result", "reflection"]), "overview"), rec(RE.result, RE.learning)],
      }
    : {
        d_problem: [txt(ai.problem, "ai"), txt(prior.problem, "simple"), txt(o.problem, "overview"), rec(RE.problem)],
        d_role: [txt(o.role, "overview"), txt(ai.role, "ai"), txt(prior.role, "simple"), rec(RE.role)],
        d_process: [txt(joinOv(o, ["process", "activity"]), "overview"), rec(RE.process)],
        d_trial: [rec(RE.trial)],
        d_feedback: [rec(RE.feedback)],
        d_result: [txt(o.result, "overview"), txt(ai.result, "ai"), txt(prior.result, "simple"), rec(RE.result)],
        d_learning: [txt(o.reflection, "overview"), rec(RE.learning)],
        d_next: [rec(RE.next)],
      };

  for (const k of keysFor(variant)) {
    if (cur[k] !== undefined) continue;
    let hit: [string, Origin] | null = null;
    for (const c of plan[k] ?? []) { hit = c(); if (hit) break; }
    cur[k] = hit ? hit[0] : "";
    if (hit) cur._src![k] = hit[1];
    else delete cur._src![k];
    if (hit) for (const s of splitText(hit[0])) used.add(norm(s));
  }
  return cur;
}

/**
 * "다시 채우기" (학생이 명시적으로 누를 때만): 직접 고친 항목은 남기고, 나머지 항목만 지운 뒤 다시 채운다.
 * keys 를 주면 그 항목만 다시 채운다.
 */
export function refill(
  current: ProjectContent | undefined,
  source: PortfolioSource,
  variant: Variant,
  opts: { ai?: AiTexts | null; prior?: AiTexts | null; keys?: SecKey[]; force?: boolean } = {},
): ProjectContent {
  const cur: ProjectContent = { ...(current ?? {}), _src: { ...(current?._src ?? {}) } };
  for (const k of opts.keys ?? keysFor(variant)) {
    if (!opts.force && cur._src![k] === "edited") continue;
    delete cur[k];
    delete cur._src![k];
  }
  return fillMissing(cur, source, variant, opts);
}

/** 학생이 고친 값: 출처를 "직접 수정함"으로 바꾼다 */
export function edit(current: ProjectContent | undefined, key: SecKey, value: string): ProjectContent {
  return { ...(current ?? {}), [key]: value, _src: { ...(current?._src ?? {}), [key]: "edited" } };
}

/** 직접 고친 항목 수 (다시 채우기 전에 알려 준다) */
export const editedCount = (c: ProjectContent | undefined, v: Variant) => keysFor(v).filter((k) => c?._src?.[k] === "edited").length;

/** 형식 하나의 글자 수 합 (분량 안내용) */
export const totalLength = (c: ProjectContent | undefined, v: Variant) => keysFor(v).reduce((n, k) => n + (c?.[k]?.length ?? 0), 0);

// ───── 증빙 자료 · 대표 이미지

export interface FileInfo {
  id: string;
  title: string;
  kind: string;
  recorded_at: string;
  has_file: boolean;
  url: string | null;
  is_result: boolean;
}

/** 처음 담을 때 미리 골라 둘 증빙: 결과물 표시 → 파일·사진 → 링크 순, 최대 max 개 */
export function defaultEvidence(files: FileInfo[], max = 6): string[] {
  const score = (f: FileInfo) => (f.is_result ? 3 : 0) + (f.kind === "photo" || f.has_file ? 2 : 0) + (f.url ? 1 : 0);
  return files.filter((f) => score(f) > 0).sort((a, b) => score(b) - score(a)).slice(0, max).map((f) => f.id);
}

/** 대표 이미지 후보: 파일이 있는 사진 기록 */
export const photoFiles = (files: FileInfo[]) => files.filter((f) => f.kind === "photo" && f.has_file);

/** 처음 담을 때 채울 증빙·대표 이미지 (이미 정한 값은 그대로) */
export function withEvidenceDefaults(c: ProjectContent, files: FileInfo[]): ProjectContent {
  return {
    ...c,
    evidence: c.evidence ?? defaultEvidence(files),
    cover: c.cover ?? photoFiles(files)[0]?.id ?? "",
  };
}

// ───── 학교생활기록부 대체서식: 활동내용 기본값

/** 대체서식 ③ 활동내용 기본값: 개요(활동→과정→결과)의 문장을 순서대로 limit 자 안에서 잇는다. 없으면 기록 발췌 */
export function altContent(source: PortfolioSource, limit = 100): { text: string; origin: Origin } | null {
  const o = source.overview ?? {};
  const sents = ["activity", "process", "result"].flatMap((k) => splitText(o[k] ?? "")).map(norm).filter(Boolean);
  const fit = (list: string[]) => {
    let out = "";
    for (const s of list) {
      const next = out ? out + " " + s : s;
      if (next.length > limit) break;
      out = next;
    }
    // 첫 문장부터 길면 자르지 않고 그대로 둔다 (중간에서 자르면 뜻이 바뀐다 · 화면이 글자 수 초과를 표시)
    return out || list[0] || "";
  };
  if (sents.length) return { text: fit(sents), origin: "overview" };
  const got = pickSentences(source.records, RE.process, new Set(), 2);
  return got.length ? { text: fit(got), origin: "record" } : null;
}

/** 대체서식 활동내용 점검: 글자 수 초과, 기관명으로 보이는 말 (서식 유의사항 ③) */
export function altWarnings(text: string, limit = 100): string[] {
  const w: string[] = [];
  if (text.length > limit) w.push(`${text.length - limit}자 넘어요`);
  const org = text.match(/[가-힣A-Za-z]*(대학교|고등학교|중학교|캠퍼스|재단|협회|센터|연구소|주식회사|\(주\))/u);
  if (org) w.push(`기관명("${org[0]}")은 쓰지 않아요`);
  return w;
}
