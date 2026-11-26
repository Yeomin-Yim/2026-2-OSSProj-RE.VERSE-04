// 키워드 파이프라인 전체 흐름. DB·OpenAI 는 밖에서 넣어 준다(deps) → 테스트와 터미널 스크립트에서도 그대로 쓴다.
//   ① 정리      : 짧은 문장·같은 문장 빼기
//   ② 후보 추출 : 명사·명사구 넉넉하게 (규칙) → 임베딩 관련도 + MMR 로 고르기
//   ③ 거름망    : 처리 이력 · 불용어 · 사전 임베딩 유사도로 AI 없이 처리
//   ④ AI 검증   : 신규·모호한 후보만 한 번에 묶어서
//   ⑤ 확정·갱신 : 새 키워드는 임베딩으로 중복을 한 번 더 확인하고 사전·처리 이력에 저장
// "@/..." 경로를 쓰지 않는다 (node 스크립트에서 바로 불러 쓰기 위해).

import {
  cosine,
  extractCandidates,
  keywordCode,
  nearestKeywords,
  PARAMS,
  pickCandidates,
  resolve,
  screen,
  toKeywordTags,
  proposeAxes,
  axisCandidates,
  type AiJudgment,
  type AxisVec,
  type AliasMemo,
  type AskItem,
  type DictKeyword,
  type FinalKeyword,
  type KeywordCategory,
  type LearnAlias,
  type Resolved,
  type Vec,
  type Verdict,
} from "../../core/keywords/index.ts";
import type { Sentence, Tag } from "../../core/types.ts";

export type Mode = "student" | "profile";

export interface CachedAlias extends AliasMemo {
  vector: Vec | null;
}

export interface KeywordStore {
  loadDictionary(): Promise<DictKeyword[]>;
  /** 표현 → 처리 이력 (+ 저장해 둔 임베딩). 없는 표현은 빠진다 */
  loadAliases(surfaces: string[]): Promise<Map<string, CachedAlias>>;
  /** 처음 본 표현의 임베딩을 저장한다 (판정 없이). 다음에는 임베딩을 다시 만들지 않는다 */
  saveEmbeddings(items: { surface: string; vector: Vec }[]): Promise<void>;
  /** 새 키워드와 처리 이력을 저장하고, 대표 이름 → 키워드 id 를 돌려준다 */
  learn(
    created: { canonical: string; category: KeywordCategory; vector: Vec; origin: Mode; axes: string[] }[],
    aliases: LearnAlias[],
    /** 사전에 있지만 축이 비어 있던 키워드에 채울 축 */
    axesFor?: { canonical: string; axes: string[] }[],
  ): Promise<Map<string, number>>;
}

export interface JudgeInput {
  mode: Mode;
  title: string;
  topic: string;
  items: { id: string; text: string; sentences: string[]; nearest: { keyword: string; similarity: number }[]; axes: { code: string; label: string; hint?: boolean }[] }[];
  /** 공통 축 목록 (코드 · 이름 · 예시). 프롬프트 앞에 한 번 보여 준다 */
  legend?: { code: string; text: string }[];
}

export interface Usage { input_tokens: number; output_tokens: number; model: string; ms: number }

export interface Deps {
  store: KeywordStore;
  /** 여러 글을 한 번에 임베딩 */
  embed(texts: string[]): Promise<{ vectors: Vec[]; tokens: number }>;
  /** 모호한 후보를 AI 가 판정 */
  judge(input: JudgeInput): Promise<{ judgments: AiJudgment[]; usage: Usage }>;
  /** 공통 축과 그 임베딩 (2층). 없으면 축 없이 1층 키워드만 만든다 */
  axes?: () => Promise<AxisVec[]>;
  /** 키워드 표현에 규칙 사전의 예시 말이 들어 있는 축 코드 (AI 에 주는 힌트. 확정이 아님) */
  axisHints?: (text: string) => string[];
}

export interface PipelineInput {
  mode: Mode;
  title: string;
  topic?: string | null;
  sentences: Pick<Sentence, "sid" | "text" | "hash">[];
}

export interface PipelineResult {
  keywords: (FinalKeyword & { code: string })[];
  tags: Tag[];
  stats: Resolved["stats"] & { embedded: number; embed_tokens: number; deferred: number; merged_new: number };
  problems: string[];
  usage: Usage | null;
}

const DOC_CHARS = 8000;
/** 사전 키워드에 축이 없을 때 임베딩만으로 붙이는 최소 유사도 (저장하지 않고 그때그때 계산) */
export const AXIS_FALLBACK = 0.45;
const MIN_SENTENCE = 4;

/** ① 정리: 너무 짧은 문장, 같은 문장(해시)을 뺀다 */
export function cleanSentences<T extends Pick<Sentence, "text" | "hash">>(sentences: T[]): T[] {
  const seen = new Set<string>();
  return sentences.filter((s) => {
    if (s.text.trim().length < MIN_SENTENCE || seen.has(s.hash)) return false;
    seen.add(s.hash);
    return true;
  });
}

export async function runKeywordPipeline(input: PipelineInput, deps: Deps): Promise<PipelineResult> {
  const problems: string[] = [];
  const sentences = cleanSentences(input.sentences);
  const empty = { candidates: 0, self_known: 0, self_dropped: 0, ai_sent: 0, ai_existing: 0, ai_new: 0, ai_dropped: 0, ai_missing: 0, embedded: 0, embed_tokens: 0, deferred: 0, merged_new: 0 };
  if (!sentences.length) return { keywords: [], tags: [], stats: empty, problems, usage: null };

  // ② 후보 추출 + 임베딩 (이미 본 표현은 저장해 둔 임베딩을 쓴다)
  const cands = extractCandidates(sentences);
  const aliases = await deps.store.loadAliases(cands.map((c) => c.surface));
  const vectors = new Map<string, Vec>();
  for (const [s, a] of aliases) if (a.vector) vectors.set(s, a.vector);
  const missing = cands.filter((c) => !vectors.has(c.surface)).map((c) => c.surface);

  const docText = [input.title, input.topic ?? "", ...sentences.map((s) => s.text)].filter(Boolean).join("\n").slice(0, DOC_CHARS);
  const { vectors: embedded, tokens } = await deps.embed([docText, ...missing]);
  const doc = embedded[0];
  missing.forEach((s, i) => vectors.set(s, embedded[i + 1]));
  if (missing.length) await deps.store.saveEmbeddings(missing.map((s, i) => ({ surface: s, vector: embedded[i + 1] })));

  const picked = pickCandidates(cands, vectors, doc, input.mode === "profile" ? PARAMS.keepProfile : PARAMS.keepStudent);

  // ③ 거름망
  const dict = await deps.store.loadDictionary();
  let verdicts: Verdict[] = screen(picked, aliases, dict);
  if (input.mode === "profile") {
    // 학과·직무 원문은 키워드마다 중요도(1~3)가 필요하므로, 불용어가 아닌 후보는 모두 AI 가 본다 (한 번만 돌리는 작업)
    verdicts = verdicts.map((v) =>
      v.kind === "known"
        ? { kind: "ambiguous", cand: v.cand, nearest: withKeyword(nearestKeywords(v.cand.vector, dict, PARAMS.nearestK, PARAMS.nearestMin), v.keyword, v.cand.vector) }
        : v,
    );
  }

  // ④ AI 검증: 모호한 것만, 관련도 높은 순으로 최대 maxAmbiguous 개. 축 후보(임베딩 상위 5개)도 함께 보여 준다
  const axisVecs = deps.axes ? await deps.axes() : [];
  const axisLabel = new Map(axisVecs.map((a) => [a.code, a.label]));
  const ambiguous = verdicts.filter((v): v is Extract<Verdict, { kind: "ambiguous" }> => v.kind === "ambiguous");
  ambiguous.sort((a, b) => b.cand.relevance - a.cand.relevance);
  const hintsOf = (s: string) => (deps.axisHints ? deps.axisHints(s) : []);
  const hintMap = new Map<string, string[]>();
  const asked: AskItem[] = ambiguous.slice(0, PARAMS.maxAmbiguous).map((verdict, i) => {
    const hints = hintsOf(verdict.cand.display);
    hintMap.set(`c${i + 1}`, hints);
    return { id: `c${i + 1}`, verdict, axes: axisVecs.length ? axisCandidates(verdict.cand.vector, axisVecs, hints) : [] };
  });
  const deferred = ambiguous.length - asked.length;
  const askedSet = new Set(asked.map((a) => a.verdict));
  verdicts = verdicts.filter((v) => v.kind !== "ambiguous" || askedSet.has(v));

  let judgments: AiJudgment[] | null = [];
  let usage: Usage | null = null;
  if (asked.length) {
    const text = new Map(sentences.map((s) => [s.sid, s.text]));
    try {
      const out = await deps.judge({
        mode: input.mode,
        title: input.title,
        topic: input.topic ?? "",
        items: asked.map(({ id, verdict, axes }) => ({
          id,
          text: verdict.cand.display,
          sentences: verdict.cand.sids.slice(0, 2).map((sid) => text.get(sid) ?? "").filter(Boolean),
          nearest: verdict.nearest.map((n) => ({ keyword: n.keyword.canonical, similarity: Math.round(n.sim * 100) / 100 })),
          axes: (axes ?? []).map((code) => ({ code, label: axisLabel.get(code) ?? code, hint: hintMap.get(id)?.includes(code) })),
        })),
        legend: axisVecs.filter((a) => a.text).map((a) => ({ code: a.code, text: a.text! })),
      });
      judgments = out.judgments;
      usage = out.usage;
    } catch (e) {
      // AI 가 실패해도 거름망에서 처리한 키워드는 저장한다. 모호한 후보는 다음 실행에서 다시 묻는다
      problems.push("AI 검증 실패: " + (e instanceof Error ? e.message : String(e)));
      judgments = null;
    }
  }
  const resolved = resolve(verdicts, asked, judgments, dict, new Set(axisVecs.map((a) => a.code)));
  problems.push(...resolved.problems);

  // ⑤ 새 키워드: 대표 이름을 임베딩해서 사전의 기존 키워드와 다시 비교 (사전이 같은 뜻으로 불어나지 않게)
  let mergedNew = 0;
  let embedTokens = tokens;
  const createdFinal: { canonical: string; category: KeywordCategory; vector: Vec; origin: Mode; axes: string[] }[] = [];
  const axesFor = [...resolved.axesFor];
  const remap = new Map<string, DictKeyword>();
  if (resolved.created.length) {
    const { vectors: nv, tokens: t2 } = await deps.embed(resolved.created.map((c) => c.canonical));
    embedTokens += t2;
    resolved.created.forEach((c, i) => {
      const near = nearestKeywords(nv[i], dict, 1, PARAMS.sameAs)[0];
      if (near) {
        remap.set(c.canonical, near.keyword);
        mergedNew++;
        if (!near.keyword.axes?.length && c.axes.length) axesFor.push({ canonical: near.keyword.canonical, axes: c.axes });
      } else createdFinal.push({ ...c, vector: nv[i], origin: input.mode });
    });
  }
  const keywords = mergeRemapped(resolved.keywords, remap);
  const learn = resolved.learn.map((l) => (l.canonical && remap.has(l.canonical) ? { ...l, canonical: remap.get(l.canonical)!.canonical } : l));

  const ids = await deps.store.learn(createdFinal, learn, axesFor);
  for (const k of keywords) if (k.keyword_id == null) k.keyword_id = ids.get(k.canonical) ?? null;

  // 축이 없는 키워드(예전에 만든 사전 키워드 등)는 임베딩만으로 가장 가까운 축 하나를 붙인다 (저장하지 않음)
  if (axisVecs.length) {
    for (const k of keywords) {
      if (k.axes.length) continue;
      const hinted = hintsOf(k.canonical).filter((h) => axisLabel.has(h));
      if (hinted.length) { k.axes = hinted.slice(0, 2); continue; }
      const v = dict.find((d) => d.canonical === k.canonical)?.vector ?? vectors.get(k.surfaces[0]?.surface ?? "");
      const top = v ? proposeAxes(v, axisVecs, 1, AXIS_FALLBACK)[0] : undefined;
      if (top) k.axes = [top.code];
    }
  }

  return {
    keywords: keywords.map((k) => ({ ...k, code: keywordCode(k.canonical) })),
    tags: toKeywordTags(keywords),
    stats: { ...resolved.stats, embedded: missing.length, embed_tokens: embedTokens, deferred, merged_new: mergedNew },
    problems,
    usage,
  };
}

function withKeyword(list: { keyword: DictKeyword; sim: number }[], k: DictKeyword, v: Vec) {
  return list.some((n) => n.keyword.id === k.id) ? list : [{ keyword: k, sim: cosine(v, k.vector) }, ...list].slice(0, PARAMS.nearestK);
}

/** 새로 만들려던 키워드가 기존 키워드와 같은 뜻이면 합친다 */
function mergeRemapped(keywords: FinalKeyword[], remap: Map<string, DictKeyword>): FinalKeyword[] {
  if (!remap.size) return keywords;
  const out = new Map<string, FinalKeyword>();
  for (const k0 of keywords) {
    const target = k0.keyword_id == null ? remap.get(k0.canonical) : undefined;
    const k = target ? { ...k0, canonical: target.canonical, category: target.category, keyword_id: target.id, axes: target.axes?.length ? target.axes : k0.axes } : k0;
    const key = k.canonical.toLowerCase();
    const cur = out.get(key);
    if (!cur) out.set(key, { ...k, sids: [...k.sids], surfaces: [...k.surfaces] });
    else {
      for (const s of k.sids) if (!cur.sids.includes(s)) cur.sids.push(s);
      cur.surfaces.push(...k.surfaces);
    }
  }
  return [...out.values()];
}
