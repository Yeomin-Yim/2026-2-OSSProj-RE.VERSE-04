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
export type BaseOrigin = "ai" | "overview" | "record" | "info" | "simple" | "edited";
/** 주 출처(AI 초안·개요·간단형 글) 뒤에 같은 항목 표현의 기록 원문 문장을 덧붙인 경우 "+record" (D011) */
export type Origin = BaseOrigin | "ai+record" | "overview+record" | "simple+record";
/** 배지 CSS 클래스 ("+"는 클래스 이름에 쓰지 않는다) */
export const originClass = (o: Origin) => (o.endsWith("+record") ? o.replace("+record", "") + " plus" : o);

// 간단형: 핵심을 빠르게 (프로젝트당 A4 가로 1쪽) · 상세형: 탐구·기여·성장을 입증 (내용 양에 따라 1~4쪽) — D015
export const SIMPLE_KEYS = ["intro", "problem", "role", "process", "result", "learn"] as const;
export const DETAILED_KEYS = ["d_problem", "d_goal", "d_role", "d_process", "d_decision", "d_trial", "d_feedback", "d_result", "d_learning", "d_next"] as const;
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
  { key: "intro", no: "", label: "프로젝트 한 줄 소개", guide: "이 프로젝트를 한 문장으로 소개해요. 표지·목록에도 쓰여요.", soft: 80, rows: 2, single: true },
  { key: "problem", no: "2", label: "프로젝트 개요 및 목표", guide: "어떤 문제를 보고 무엇을 하려 했나요? (2~3문장)", soft: 160, rows: 4 },
  { key: "role", no: "3", label: "나의 핵심 역할", guide: "내가 맡고 직접 한 일 중 가장 중요한 것 (2~3문장)", soft: 150, rows: 4 },
  { key: "process", no: "4", label: "주요 실행 과정", guide: "어떤 방법으로 진행했나요? (2~3문장)", soft: 160, rows: 4 },
  { key: "result", no: "5", label: "대표 결과물 및 성과", guide: "무엇을 만들고 무엇을 확인했나요? (1~2문장)", soft: 130, rows: 3 },
  { key: "learn", no: "6", label: "배운 점", guide: "이 프로젝트로 배운 한 가지 (1~2문장)", soft: 110, rows: 3 },
];

export const DETAILED_SECTIONS: SectionDef[] = [
  { key: "d_problem", no: "1", label: "프로젝트 배경과 문제 정의", guide: "시작한 배경, 문제를 발견한 계기, 조사·관찰로 확인한 내용, 해결할 문제의 범위", soft: 600, rows: 7 },
  { key: "d_goal", no: "2", label: "프로젝트 목표 및 접근 방식", guide: "무엇을 목표로 했고 어떤 방법으로 접근하기로 했나요?", soft: 400, rows: 5 },
  { key: "d_role", no: "3", label: "나의 역할과 구체적인 기여", guide: "직접 맡은 업무, 수행 방법, 내가 내린 판단, 팀 결과에 기여한 부분 (개인 기여가 확인되는 것만)", soft: 600, rows: 7 },
  { key: "d_process", no: "4", label: "탐구 및 조사 과정", guide: "어떤 자료를 어떤 방법·도구로 수집하고 분석했나요?", soft: 700, rows: 8 },
  { key: "d_decision", no: "5", label: "주요 실행 단계와 의사결정", guide: "어떤 순서로 진행했고, 중간에 무엇을 왜 결정했나요?", soft: 600, rows: 7 },
  { key: "d_trial", no: "6", label: "시행착오와 문제 해결", guide: "문제 발생 → 원인 파악 → 해결 시도 → 수정 결과", soft: 500, rows: 6 },
  { key: "d_feedback", no: "7", label: "피드백과 개선", guide: "실제로 받은 피드백, 고친 이유와 내용, 고친 뒤 확인한 결과", soft: 500, rows: 6 },
  { key: "d_result", no: "8", label: "프로젝트 결과와 성과", guide: "최종 결과물과 특징, 확인된 성과, 해결하지 못한 한계", soft: 600, rows: 7 },
  { key: "d_learning", no: "10", label: "성찰과 성장", guide: "새로 배운 것, 활동 전후 달라진 접근, 발전한 역량", soft: 500, rows: 6 },
  { key: "d_next", no: "11", label: "향후 발전 방향", guide: "이후 프로젝트와의 연결, 다음에 시도하고 싶은 것", soft: 350, rows: 4 },
];
/** 상세형 9번(증빙자료)은 글이 아니라 자료 선택이라 따로 그린다 */
export const EVIDENCE_NO = "9";

export const sectionsFor = (v: Variant) => (v === "simple" ? SIMPLE_SECTIONS : DETAILED_SECTIONS);
export const keysFor = (v: Variant): readonly SecKey[] => (v === "simple" ? SIMPLE_KEYS : DETAILED_KEYS);

export const ORIGIN_LABEL: Record<Origin, string> = {
  ai: "AI 초안",
  overview: "개요에서 옮김",
  record: "기록에서 발췌",
  info: "프로젝트 정보",
  simple: "간단형 글에서 옮김",
  edited: "직접 수정함",
  "ai+record": "AI 초안 + 기록 발췌",
  "overview+record": "개요 + 기록 발췌",
  "simple+record": "간단형 글 + 기록 발췌",
};
export const ORIGIN_HINT: Record<Origin, string> = {
  ai: "기록 문장을 근거로 AI가 쓴 초안이에요. 근거 문장이 실제로 있는지 코드가 확인했어요.",
  overview: "프로젝트 관리 → 개요에 정리된 글을 그대로 옮겼어요.",
  record: "기록 원문에서 이 항목과 맞는 문장을 고치지 않고 옮겼어요. 읽기 좋게 다듬어 주세요.",
  info: "프로젝트 주제(정보)를 그대로 옮겼어요.",
  simple: "간단형에 쓴 글을 옮겼어요.",
  edited: "직접 고친 글이에요. 다시 채우기를 해도 바뀌지 않아요.",
  "ai+record": "AI 초안(근거 문장 확인됨) 뒤에, 같은 항목에 해당하는 기록 원문 문장을 고치지 않고 덧붙였어요. 겹치는 내용은 지워 주세요.",
  "overview+record": "개요의 글 뒤에, 같은 항목에 해당하는 기록 원문 문장을 고치지 않고 덧붙였어요.",
  "simple+record": "간단형에 쓴 글 뒤에, 같은 항목에 해당하는 기록 원문 문장을 덧붙였어요.",
};

/** AI 초안 3섹션의 글 (draftProject 결과에서 text 만) */
export interface AiTexts { problem?: string; role?: string; result?: string }

// 기록 문장 발췌에 쓰는 표현 (lib/core/projects/checks.ts KW 와 같은 계열, 항목별로 조금 넓힘)
const RE = {
  problem: /문제|불편|어려움|계기|왜 |필요성|해결하고/u,
  role: /내가|제가|나는 |저는 |맡았|맡아|맡은|담당|역할|직접/u,
  process: /인터뷰|조사|관찰|설문|시도|제작|분석|실험|진행했|만들었|만들어|정리했/u,
  trial: /어려웠|어려움|실패|막혔|막히|오류|안 됐|안됐|잘 안|문제가 생|문제였|해결했|해결하|바꿨|바꾸었|다시 /u,
  feedback: /피드백|의견|조언|코멘트|반응|지적|질문을 받|반영|수정했|고쳤/u,
  result: /완성|결과|시안|발표|달라졌|변화|만들었|개선됐|줄었|늘었/u,
  learning: /배운|배웠|느낀|느꼈|깨달|성장|알게 되/u,
  next: /다음에|다음엔|다음에는|앞으로|보완|개선하고|아쉬|더 해 보|해보고 싶/u,
  goal: /목표|목적|하고자|하려고|하기로 했|계획|방향|접근|가설|기대/u,
  research: /인터뷰|조사|관찰|설문|수집|분석|자료|측정|실험|문헌|통계|데이터|응답/u,
  decision: /결정|정했|정하고|선택|확정|합의|동의|하기로|채택|기준|순서|단계|우선/u,
} as const;

const MIN_SENT = 8;
const MAX_SENT = 300;
const norm = (s: string) => s.replace(/\s+/g, " ").trim();
const firstSentence = (t: string | undefined) => (t ? splitText(t)[0] ?? "" : "");

/** 기록 원문에서 표현이 맞는 문장을 그대로 고른다 (같은 문장은 한 번만, 최대 max 개) */
export function pickSentences(records: PortfolioSource["records"], re: RegExp, used: Set<string>, max = 3, exclude?: RegExp): string[] {
  const out: string[] = [];
  for (const r of records) {
    for (const s of splitText(r.text || "")) {
      if (out.length >= max) return out;
      const t = norm(s), key = t;
      if (t.length < MIN_SENT || t.length > MAX_SENT || used.has(key) || !re.test(t) || exclude?.test(t)) continue;
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
  // 성찰·향후 방향이 아닌 항목에는 배움·다음 계획 문장을 넣지 않는다 ("문제"라는 단어만으로 회고 문장이 섞이지 않게)
  const REFLECT = /배운|배웠|배우게|깨달|느낀|느꼈|다음엔|다음에는|앞으로/u;
  const isReflect = (re: RegExp) => re === RE.learning || re === RE.next;
  const rec = (...res: RegExp[]): Cand => () => {
    const per = variant === "simple" ? (res.length > 1 ? 1 : 2) : (res.length > 1 ? 3 : 6);
    const got = res.flatMap((re) => pickSentences(source.records, re, used, per, isReflect(re) ? undefined : REFLECT));
    return got.length ? [got.join("\n"), "record"] : null;
  };

  // 개요 역할이 "설문 설계 · 사용자 조사 · …" 같은 키워드 나열이면 "담당:" 한 줄로 두고 기록 문장을 붙인다 (D015)
  const isKeywords = (t: string | undefined) => !!t && !/[.!?。다요]\s*$/.test(t.trim()) && /[·,/]/.test(t);
  const roleLine = o.role && isKeywords(o.role) ? `담당: ${o.role.trim()}` : o.role;
  const approach = o.activity ? `접근 방식: ${o.activity.trim()}` : "";

  const plan: Partial<Record<SecKey, Cand[]>> = variant === "simple"
    ? {
        intro: [txt(source.topic ?? "", "info"), txt(firstSentence(o.activity), "overview"), txt(firstSentence(o.problem), "overview")],
        problem: [txt(ai.problem, "ai"), txt(o.problem, "overview"), rec(RE.problem)],
        role: [txt(ai.role, "ai"), txt(roleLine, "overview"), rec(RE.role)],
        process: [txt(o.process, "overview"), rec(RE.process)],
        result: [txt(o.result, "overview"), txt(ai.result, "ai"), rec(RE.result)],
        learn: [txt(o.reflection, "overview"), rec(RE.learning)],
      }
    : {
        d_problem: [txt(ai.problem, "ai"), txt(prior.problem, "simple"), txt(o.problem, "overview"), rec(RE.problem)],
        d_goal: [txt(approach, "overview"), rec(RE.goal)],
        d_role: [txt(roleLine, "overview"), txt(ai.role, "ai"), txt(prior.role, "simple"), rec(RE.role)],
        d_process: [txt(o.process, "overview"), rec(RE.research)],
        d_decision: [rec(RE.decision)],
        d_trial: [rec(RE.trial)],
        d_feedback: [rec(RE.feedback)],
        d_result: [txt(o.result, "overview"), txt(ai.result, "ai"), txt(prior.result, "simple"), rec(RE.result)],
        d_learning: [txt(o.reflection, "overview"), rec(RE.learning)],
        d_next: [rec(RE.next)],
      };

  // 주 출처 뒤에 덧붙일 기록 원문 표현 (항목별)
  const SUPP: Record<SecKey, RegExp[]> = {
    intro: [], problem: [RE.problem], role: [RE.role], process: [RE.process], result: [RE.result], learn: [RE.learning],
    d_problem: [RE.problem], d_goal: [RE.goal], d_role: [RE.role], d_process: [RE.research], d_decision: [RE.decision], d_trial: [RE.trial], d_feedback: [RE.feedback],
    d_result: [RE.result], d_learning: [RE.learning], d_next: [RE.next],
  };
  for (const k of keysFor(variant)) {
    if (cur[k] !== undefined) continue;
    let hit: [string, Origin] | null = null;
    for (const c of plan[k] ?? []) { hit = c(); if (hit) break; }
    if (hit) for (const s of splitText(hit[0])) used.add(norm(s));
    // AI 초안·개요가 짧게 요약한 항목은 같은 항목의 기록 원문 문장으로 보강한다 (원문 그대로, D011)
    if (hit && (hit[1] === "ai" || hit[1] === "overview" || hit[1] === "simple")) {
      // 간단형은 압축(주 출처 + 1문장), 상세형은 실제 과정이 드러나게 (AI 초안 + 3 / 개요 한 줄 + 5)
      const max = variant === "simple" ? (hit[1] === "ai" ? 0 : 1) : (hit[1] === "ai" ? 3 : 5);
      const extra = SUPP[k].flatMap((re) => pickSentences(source.records, re, used, max, isReflect(re) ? undefined : REFLECT)).slice(0, max);
      if (extra.length) hit = [hit[0] + "\n\n" + extra.join("\n"), (hit[1] + "+record") as Origin];
    }
    cur[k] = hit ? hit[0] : "";
    if (hit) cur._src![k] = hit[1];
    else delete cur._src![k];
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

// ───── 표지·나의 소개 / 성장 정리의 기본값 (기록 원문 발췌만, 새 문장 없음 · D011)

/**
 * 나의 소개: 각 프로젝트의 문제(시작 계기) 첫 문장, 앞으로의 방향: 기록의 "다음에·앞으로" 문장.
 * 학생이 비워 둔 칸을 채울 때만 쓴다 (학생이 누르거나, 처음 만들 때).
 */
export function profileFromRecords(sources: PortfolioSource[], content: ContentMap, variant: Variant): { motivation: string; aspiration: string } {
  const key: SecKey = variant === "simple" ? "problem" : "d_problem";
  const motivation = sources
    .map((p) => firstSentence(content[p.id]?.[key] ?? "") || firstSentence(p.overview?.problem))
    .filter(Boolean)
    .join("\n");
  const used = new Set<string>();
  const aspiration = sources.flatMap((p) => pickSentences(p.records, RE.next, used, 2)).slice(0, 4).join("\n");
  return { motivation, aspiration };
}
