import { test } from "node:test";
import assert from "node:assert/strict";
import {
  axisWeights,
  buildAxes,
  cleanAxes,
  cleanCanonical,
  cosine,
  expandRelated,
  forGraph,
  forRecommend,
  MIN_TOTAL,
  patternWords,
  profileWeights,
  scoreProfiles,
  extractCandidates,
  filterProjectRecords,
  keywordCode,
  pickCandidates,
  resolve,
  screen,
  toNoun,
  type AiJudgment,
  type AliasMemo,
  type DictKeyword,
  type Scored,
  type Vec,
} from "../../lib/core/index.ts";
import { runKeywordPipeline, type CachedAlias, type Deps, type JudgeInput, type KeywordStore } from "../../lib/server/keywords/pipeline.ts";
import { judgePrompt } from "../../lib/server/keywords/judge.ts";

// ───────── 가짜 임베딩: 글자 1·2-gram 을 128칸에 해시. 표기가 비슷하면 가깝다 ─────────
const DIM = 128;
function fakeVec(text: string): Vec {
  const v = new Array(DIM).fill(0);
  const t = text.replace(/\s+/g, "");
  const bump = (s: string) => {
    let h = 0;
    for (const ch of s) h = (h * 31 + ch.codePointAt(0)!) % 100003;
    v[h % DIM] += 1;
  };
  for (let i = 0; i < t.length; i++) {
    bump(t[i]);
    if (i + 1 < t.length) bump(t.slice(i, i + 2));
  }
  return v;
}

function memoryStore(): KeywordStore & { dict: DictKeyword[]; aliases: Map<string, CachedAlias>; learned: number } {
  const s = {
    dict: [] as DictKeyword[],
    aliases: new Map<string, CachedAlias>(),
    learned: 0,
    async loadDictionary() { return [...s.dict]; },
    async loadAliases(surfaces: string[]) {
      return new Map(surfaces.filter((x) => s.aliases.has(x)).map((x) => [x, s.aliases.get(x)!]));
    },
    async saveEmbeddings(items: { surface: string; vector: Vec }[]) {
      for (const i of items) if (!s.aliases.has(i.surface)) s.aliases.set(i.surface, { surface: i.surface, decision: null, keyword_id: null, context_free: true, vector: i.vector });
    },
    async learn(created: { canonical: string; category: DictKeyword["category"]; vector: Vec; axes: string[] }[], aliases: { surface: string; decision: "keyword" | "stop"; canonical: string | null; context_free: boolean }[], axesFor: { canonical: string; axes: string[] }[] = []) {
      s.learned++;
      for (const c of created) {
        if (!s.dict.some((d) => d.canonical.toLowerCase() === c.canonical.toLowerCase())) {
          s.dict.push({ id: s.dict.length + 1, canonical: c.canonical, category: c.category, vector: c.vector, axes: c.axes });
        }
      }
      for (const f of axesFor) {
        const d = s.dict.find((x) => x.canonical === f.canonical);
        if (d && !d.axes?.length) d.axes = f.axes;
      }
      for (const a of aliases) {
        const kw = s.dict.find((d) => d.canonical === a.canonical);
        const prev = s.aliases.get(a.surface);
        s.aliases.set(a.surface, { surface: a.surface, decision: a.decision, keyword_id: kw?.id ?? null, context_free: a.context_free, vector: prev?.vector ?? null });
      }
      return new Map(s.dict.map((d) => [d.canonical, d.id]));
    },
  };
  return s;
}

/** 가짜 AI: 표현을 정해 둔 규칙으로 판정하고, 호출 기록을 남긴다 */
function fakeJudge(rules: Record<string, Partial<AiJudgment>>, calls: JudgeInput[]) {
  return async (input: JudgeInput) => {
    calls.push(input);
    const judgments: AiJudgment[] = input.items.map((it) => ({
      id: it.id,
      decision: "drop",
      keyword: it.text,
      category: "activity",
      importance: "medium",
      context_free: true,
      axes: [],
      ...rules[it.text],
    }));
    return { judgments, usage: { input_tokens: 100, output_tokens: 20, model: "fake", ms: 1 } };
  };
}

const deps = (store: KeywordStore, judge: Deps["judge"]): Deps => ({
  store,
  embed: async (texts) => ({ vectors: texts.map(fakeVec), tokens: texts.length }),
  judge,
});

const S = (sid: string, text: string) => ({ sid, text, hash: sid + text });

// ───────── ② 후보 추출 ─────────

test("명사 모양: 조사·하다를 떼고, 동사는 빼고, 받침 없는 명사는 자르지 않는다", () => {
  assert.equal(toNoun("데이터를"), "데이터");
  assert.equal(toNoun("분석했다"), "분석");
  assert.equal(toNoun("설문조사에서"), "설문조사");
  assert.equal(toNoun("만들었다"), null);
  assert.equal(toNoun("고양이"), "고양이"); // '이'로 끝나는 명사 목록
  assert.equal(toNoun("느낌이"), "느낌");
  assert.equal(toNoun("전문가"), "전문가"); // '가'로 끝나는 직업 명사
  assert.equal(toNoun("정보가"), "정보");
  assert.equal(toNoun("전자회로를"), "전자회로");
  assert.equal(toNoun("지도"), "지도"); // '도'는 단독으로 나온 적이 있을 때만 뗀다
  assert.equal(toNoun("역할"), "역할"); // '할' 앞이 한 글자면 하다 활용이 아니다
  assert.equal(toNoun("분석해"), "분석");
  assert.equal(toNoun("때에는"), null);
  assert.equal(toNoun("묻는"), null);
  assert.equal(toNoun("살펴보고"), null);
  assert.equal(toNoun("통계적인"), "통계적");
  assert.equal(toNoun("Python"), "Python");
  assert.equal(toNoun("3D"), "3D");
});

test("후보: 쉼표로 나열된 말은 명사구로 묶지 않고, '-적' 꾸밈말은 명사구 앞자리로만 쓴다", () => {
  const c = extractCandidates([S("S1", "가구, 신발, 가방을 디자인한다."), S("S2", "통계적인 사고방식을 기른다.")]);
  const s = new Set(c.map((x) => x.surface));
  assert.ok(s.has("가구") && s.has("신발") && !s.has("가구 신발"));
  assert.ok(s.has("통계적 사고방식") && !s.has("통계적"));
});

test("후보: 명사와 붙은 명사구를 뽑고, 불용어는 빼고, 문장 ID 를 모은다", () => {
  const c = extractCandidates([
    S("S1", "이번 프로젝트에서 급식 잔반 데이터 분석을 진행했다."),
    S("S2", "Python으로 데이터 분석 그래프를 만들었다."),
  ]);
  const by = new Map(c.map((x) => [x.surface, x]));
  assert.ok(by.has("데이터 분석"));
  assert.deepEqual(by.get("데이터 분석")!.sids, ["S1", "S2"]);
  assert.ok(by.has("python"));
  assert.ok(!by.has("이번") && !by.has("프로젝트") && !by.has("진행"));
  assert.equal(c[0].count >= c.at(-1)!.count, true); // 많이 나온 순서
});

// ───────── ②③ 임베딩 선택 · 거름망 ─────────

const unit = (...xs: number[]) => xs;
const scored = (surface: string, vector: Vec, relevance = 0.5): Scored => ({ surface, display: surface, sids: ["S1"], count: 1, vector, relevance });

test("KeyBERT+MMR: 관련 낮은 후보는 버리고, 거의 같은 후보는 하나만 고른다", () => {
  const doc = unit(1, 1, 0);
  const vectors = new Map<string, Vec>([
    ["데이터 분석", unit(1, 0.9, 0)],
    ["데이터분석", unit(1, 0.92, 0)], // 거의 같음
    ["설문 조사", unit(0.6, 1, 0.1)],
    ["날씨", unit(0, 0, 1)], // 관련 없음
  ]);
  const cands = [...vectors.keys()].map((surface) => ({ surface, display: surface, sids: ["S1"], count: 1 }));
  const picked = pickCandidates(cands, vectors, doc, 2, { minRelevance: 0.2, mmrLambda: 0.5 });
  const names = picked.map((p) => p.surface);
  assert.equal(names.length, 2);
  assert.ok(names.includes("설문 조사"));
  assert.ok(!names.includes("날씨"));
  assert.ok(!(names.includes("데이터 분석") && names.includes("데이터분석")));
});

test("거름망: 처리 이력 → 불용어 → 사전 유사도 순서, 문맥 의존 표현은 다시 묻는다", () => {
  const dict: DictKeyword[] = [
    { id: 1, canonical: "데이터 분석", category: "activity", vector: unit(1, 0, 0) },
    { id: 2, canonical: "설문 조사", category: "activity", vector: unit(0, 1, 0) },
  ];
  const aliases = new Map<string, AliasMemo>([
    ["이번", { surface: "이번", decision: "stop", keyword_id: null, context_free: true }],
    ["자료 분석", { surface: "자료 분석", decision: "keyword", keyword_id: 1, context_free: true }],
    ["모델", { surface: "모델", decision: "keyword", keyword_id: 2, context_free: false }],
  ]);
  const v = screen(
    [
      scored("이번", unit(0, 0, 1)),
      scored("자료 분석", unit(0, 0, 1)),
      scored("모델", unit(0, 0, 1)),
      scored("데이터분석", unit(0.99, 0.05, 0)),
      scored("인터뷰", unit(0.5, 0.5, 0.7)),
    ],
    aliases,
    dict,
  );
  assert.deepEqual(v.map((x) => x.kind), ["drop", "known", "ambiguous", "known", "ambiguous"]);
  assert.equal(v[1].kind === "known" && v[1].how, "alias");
  assert.equal(v[3].kind === "known" && v[3].keyword.canonical, "데이터 분석");
  assert.ok(v[4].kind === "ambiguous" && v[4].nearest.length === 0); // 0.6 미만은 보여 주지 않는다
});

// ───────── ④ AI 판정 검증 ─────────

test("AI 판정 검증: 없는 ID·보여 주지 않은 키워드·이상한 값은 코드가 바로잡는다", () => {
  const dict: DictKeyword[] = [{ id: 1, canonical: "데이터 분석", category: "activity", vector: unit(1, 0) }];
  const amb = (s: string, sids = ["S1"]) => ({ kind: "ambiguous" as const, cand: { ...scored(s, unit(0.7, 0.7)), sids }, nearest: [{ keyword: dict[0], sim: 0.8 }] });
  const a = amb("자료분석", ["S1"]), b = amb("데이터 정리", ["S2"]), c = amb("이번 주"), d = amb("파이썬"), e = amb("빠진것");
  const asked = [a, b, c, d, e].map((verdict, i) => ({ id: `c${i + 1}`, verdict }));
  const judgments: AiJudgment[] = [
    { id: "c1", decision: "existing", keyword: "데이터 분석", category: "activity", importance: "high", context_free: true },
    { id: "c2", decision: "existing", keyword: "데이터 분석", category: "x", importance: "???", context_free: true },
    { id: "c3", decision: "drop", keyword: "", category: "topic", importance: "low", context_free: true },
    { id: "c4", decision: "new", keyword: "  Python ", category: "tech", importance: "medium", context_free: true },
    { id: "c9", decision: "new", keyword: "유령", category: "tech", importance: "low", context_free: true },
  ];
  const r = resolve([a, b, c, d, e], asked, judgments, dict);
  const names = r.keywords.map((k) => k.canonical).sort();
  assert.deepEqual(names, ["Python", "데이터 분석"]);
  const data = r.keywords.find((k) => k.canonical === "데이터 분석")!;
  assert.deepEqual(data.sids.sort(), ["S1", "S2"]); // 두 후보가 한 키워드로 합쳐짐
  assert.equal(data.importance, "high");
  assert.deepEqual(r.created, [{ canonical: "Python", category: "tech", axes: [] }]);
  assert.ok(r.problems.some((p) => p.includes("c9")));
  assert.equal(r.stats.ai_missing, 1); // c5 는 답이 없음 → 배우지 않음
  assert.ok(!r.learn.some((l) => l.surface === "빠진것"));
  assert.ok(r.learn.some((l) => l.surface === "이번 주" && l.decision === "stop"));
  assert.equal(cleanCanonical("  데이터   분석 ."), "데이터 분석");
  assert.equal(cleanCanonical("가".repeat(31)), null);
});

// ───────── 전체 흐름 ─────────

const RECORD = [
  S("N1·V1·S1", "급식 잔반 데이터를 반별로 모았다."),
  S("N1·V1·S2", "Python으로 잔반 데이터를 분석했다."),
  S("N2·V1·S1", "학생 설문조사를 진행했고 잔반 그래프를 만들었다."),
];
const RULES: Record<string, Partial<AiJudgment>> = {
  "잔반": { decision: "new", keyword: "급식 잔반", category: "topic", importance: "high" },
  "급식 잔반": { decision: "new", keyword: "급식 잔반", category: "topic", importance: "high" },
  "잔반 데이터": { decision: "new", keyword: "급식 잔반", category: "topic", importance: "high" },
  "Python": { decision: "new", keyword: "Python", category: "tech", importance: "medium" },
  "설문조사": { decision: "new", keyword: "설문 조사", category: "activity", importance: "medium" },
  "그래프": { decision: "new", keyword: "데이터 시각화", category: "activity", importance: "low" },
  "데이터": { decision: "new", keyword: "데이터 분석", category: "activity", importance: "high" },
};

test("파이프라인: 처음엔 AI 가 판정하고, 같은 기록을 다시 돌리면 AI 를 부르지 않는다", async () => {
  const store = memoryStore();
  const calls: JudgeInput[] = [];
  const d = deps(store, fakeJudge(RULES, calls));

  const first = await runKeywordPipeline({ mode: "student", title: "급식 잔반 줄이기", sentences: RECORD }, d);
  assert.equal(calls.length, 1);
  assert.ok(first.stats.ai_sent > 0);
  const names = first.keywords.map((k) => k.canonical);
  assert.ok(names.includes("급식 잔반") && names.includes("Python"), names.join(","));
  assert.ok(first.tags.every((t) => t.code.startsWith("K:") && RECORD.some((s) => s.sid === t.sid)));
  assert.ok(store.dict.length >= 2);

  const second = await runKeywordPipeline({ mode: "student", title: "급식 잔반 줄이기", sentences: RECORD }, d);
  assert.equal(calls.length, 1, "두 번째 실행에서는 AI 를 부르지 않아야 한다");
  assert.equal(second.stats.ai_sent, 0);
  assert.deepEqual(second.keywords.map((k) => k.canonical).sort(), names.sort());
  assert.equal(second.stats.embedded, 0); // 표현 임베딩도 다시 만들지 않는다
});

test("파이프라인: AI 가 실패해도 거름망에서 처리한 키워드는 남기고, 모호한 것은 배우지 않는다", async () => {
  const store = memoryStore();
  store.dict.push({ id: 1, canonical: "Python", category: "tech", vector: fakeVec("python") });
  const d = deps(store, async () => { throw new Error("timeout"); });
  const r = await runKeywordPipeline({ mode: "student", title: "잔반", sentences: RECORD }, d);
  assert.deepEqual(r.keywords.map((k) => k.canonical), ["Python"]);
  assert.ok(r.problems.some((p) => p.includes("timeout")));
  assert.ok([...store.aliases.values()].every((a) => a.decision === null));
});

test("파이프라인: AI 가 만든 새 키워드가 기존 키워드와 같은 뜻이면 사전에 새로 넣지 않고 합친다", async () => {
  const store = memoryStore();
  store.dict.push({ id: 1, canonical: "설문조사", category: "activity", vector: fakeVec("설문조사") });
  const calls: JudgeInput[] = [];
  const d = deps(store, fakeJudge({ "학생 설문조사": { decision: "new", keyword: "설문 조사", category: "activity" } }, calls));
  const r = await runKeywordPipeline({ mode: "student", title: "설문", sentences: [S("S1", "학생 설문조사 결과를 정리해서 공유했다.")] }, d);
  assert.ok(r.keywords.some((k) => k.canonical === "설문조사" && k.keyword_id === 1), JSON.stringify(r.keywords.map((k) => k.canonical)));
  assert.ok(!store.dict.some((k) => k.canonical === "설문 조사"));
});

test("파이프라인: 학과·직무 원문은 모든 후보를 AI 가 보고 중요도를 매긴다", async () => {
  const store = memoryStore();
  store.dict.push({ id: 1, canonical: "데이터 분석", category: "activity", vector: fakeVec("데이터분석") });
  const calls: JudgeInput[] = [];
  const d = deps(store, fakeJudge({ "데이터 분석": { decision: "existing", keyword: "데이터 분석", importance: "high" } }, calls));
  const r = await runKeywordPipeline(
    { mode: "profile", title: "통계학과", sentences: [S("S1", "통계학과는 데이터 분석 방법을 배운다."), S("S2", "데이터 분석 실습을 한다.")] },
    d,
  );
  assert.equal(calls.length, 1);
  assert.ok(calls[0].items.some((i) => i.text === "데이터 분석")); // 사전에 있어도 중요도를 받으려고 보낸다
  assert.equal(r.keywords.find((k) => k.canonical === "데이터 분석")?.importance, "high");
});

// ───────── 추천·연결에 쓰기 ─────────

test("꼬리표 선택: 추천은 축만(A: 를 떼서), 연결은 키워드+축, 키워드가 없는 프로젝트는 규칙 태그", () => {
  const projects = [
    { id: "A", tags: new Map([["M17", ["s1"]], [keywordCode("Python"), ["s1"]], ["A:T01", ["s1"]], ["A:M17", ["s2"]]]) },
    { id: "B", tags: new Map([["M17", ["s3"]]]) },
  ];
  const rec = forRecommend(projects, "auto");
  assert.deepEqual([...rec[0].tags.keys()].sort(), ["M17", "T01"]);
  assert.deepEqual(rec[0].tags.get("M17"), ["s2"]); // 규칙 태그(s1)가 아니라 축(s2)의 근거
  assert.deepEqual([...rec[1].tags.keys()], ["M17"]);
  assert.deepEqual([...forGraph(projects, "auto")[0].tags.keys()].sort(), ["K:Python", "M17", "T01"]);
  assert.deepEqual([...forRecommend(projects, "rules")[0].tags.keys()], ["M17"]);
  assert.equal(forRecommend(projects, "keywords")[1].tags.size, 0);

  const recs = filterProjectRecords([{ tags: [{ code: "M17", sid: "s1", matched: "" }] }, { tags: [{ code: "K:Python", sid: "s2", matched: "" }, { code: "A:T01", sid: "s2", matched: "Python" }] }], "auto");
  assert.deepEqual(recs.map((r) => r.tags.map((t) => t.code)), [[], ["K:Python", "A:T01"]]);
});

test("공통 축: 정규식 패턴을 예시 말로 바꾸고, 축 코드는 아는 것만 최대 3개", () => {
  assert.equal(patternWords("설문 ?(조사|문항)"), "설문 조사 문항");
  assert.equal(patternWords("\\bsql\\b"), "sql");
  const axes = buildAxes({ version: "t", exclude_default: [], exclude_applies_to: [], tags: { M04: { label: "설문·표본 조사", group: "method", patterns: ["설문", "문항"] } } });
  assert.equal(axes[0].text, "설문·표본 조사: 설문, 문항");
  assert.ok(axes.some((a) => a.code === "D19")); // 보충 축
  assert.deepEqual(cleanAxes(["m04", "M04", "X99", "D19", "T01", "M01"], new Set(["M04", "D19", "T01", "M01"])), ["M04", "D19", "T01"]);
  assert.deepEqual(axisWeights([{ axes: ["M04", "D17"], importance: "medium" }, { axes: ["M04"], importance: "high" }]), { M04: 3, D17: 2 });
  assert.deepEqual(profileWeights({ "A:M04": 2, M04: 3, "K:설문": 3, D17: 1 }), { M04: 3, D17: 1 });
});

test("점수 분모 최소값: 칸이 하나뿐인 점수표가 쉽게 100점이 되지 않는다", () => {
  const projects = [{ id: "P", tags: new Map([["M06", ["s1"]]]) }];
  const one = { id: "one", weights: { M06: 2 } };
  assert.equal(scoreProfiles(projects, [one])[0].score, 100);
  assert.equal(scoreProfiles(projects, [one], { minTotal: MIN_TOTAL })[0].score, Math.round((100 * 2) / MIN_TOTAL * 10) / 10);
});

test("비슷한 키워드: 임베딩이 가까우면 점수표 칸을 채운 것으로 본다", () => {
  const vec: Record<string, Vec> = { "급식 데이터 분석": unit(1, 0.2), "데이터 분석": unit(1, 0.1), "웹 개발": unit(0, 1) };
  const out = expandRelated(
    [{ id: "P", tags: new Map([[keywordCode("급식 데이터 분석"), ["s1"]]]) }],
    [keywordCode("데이터 분석"), keywordCode("웹 개발")],
    (c) => vec[c],
  );
  assert.deepEqual(out[0].tags.get("K:데이터 분석"), ["s1"]);
  assert.ok(!out[0].tags.has("K:웹 개발"));
  assert.ok(cosine(vec["급식 데이터 분석"], vec["데이터 분석"]) > 0.8);
});

test("AI 프롬프트: 후보 ID, 가까운 기존 키워드, 문장이 들어간다", () => {
  const p = judgePrompt({ mode: "student", title: "잔반", topic: "환경", items: [{ id: "c1", text: "잔반 데이터", sentences: ["잔반 데이터를 모았다."], nearest: [{ keyword: "데이터 분석", similarity: 0.71 }], axes: [{ code: "M06", label: "정량 분석" }] }] });
  assert.ok(p.includes("[c1] 잔반 데이터"));
  assert.ok(p.includes("데이터 분석(0.71)"));
  assert.ok(p.includes("잔반 데이터를 모았다."));
  assert.ok(p.includes("축 후보: M06 정량 분석"));
});

test("파이프라인: AI 가 고른 축이 키워드에 저장되고, 다음 실행에서는 AI 없이 같은 축을 받는다", async () => {
  const store = memoryStore();
  const calls: JudgeInput[] = [];
  const axisList = [
    { code: "M04", label: "설문·표본 조사", vector: fakeVec("설문 문항 조사") },
    { code: "D17", label: "식품·농업·먹거리", vector: fakeVec("급식 잔반 음식") },
  ];
  const d: Deps = {
    ...deps(store, fakeJudge({
      "잔반": { decision: "new", keyword: "급식 잔반", category: "topic", importance: "high", axes: ["D17", "Z99"] },
      "설문조사": { decision: "new", keyword: "설문 조사", category: "activity", axes: ["M04"] },
    }, calls)),
    axes: async () => axisList,
  };
  const first = await runKeywordPipeline({ mode: "student", title: "잔반", sentences: RECORD }, d);
  const jan = first.keywords.find((k) => k.canonical === "급식 잔반")!;
  assert.deepEqual(jan.axes, ["D17"]); // 모르는 축 Z99 는 버림
  assert.ok(first.tags.some((t) => t.code === "A:D17" && t.matched === "급식 잔반"));
  assert.ok(calls[0].items.every((i) => Array.isArray(i.axes)));
  assert.deepEqual(store.dict.find((k) => k.canonical === "급식 잔반")?.axes, ["D17"]);

  const second = await runKeywordPipeline({ mode: "student", title: "잔반", sentences: RECORD }, d);
  assert.equal(calls.length, 1);
  assert.deepEqual(second.keywords.find((k) => k.canonical === "급식 잔반")?.axes, ["D17"]);
});
