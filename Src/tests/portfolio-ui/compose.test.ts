// 포트폴리오 자동 초안 조합 (components/portfolio/compose.ts) — 실행: cd Src && npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  altContent, altWarnings, defaultEvidence, edit, editedCount, fillMissing, pickSentences, refill, withEvidenceDefaults,
  DETAILED_KEYS, SIMPLE_KEYS, type FileInfo,
} from "../../components/portfolio/compose.ts";
import type { PortfolioSource } from "../../lib/core/index.ts";

const src = (over: Partial<PortfolioSource> = {}): PortfolioSource => ({
  id: "p1",
  title: "다회용컵 순환",
  topic: "교내 일회용컵 줄이기",
  start_date: "2026-03-02",
  end_date: "2026-05-29",
  overview: {},
  records: [
    { id: "r1", title: "1차 회의", text: "급식실 앞에 버려진 컵이 많아 불편하다는 문제가 있었다. 나는 설문 문항을 맡았다." },
    { id: "r2", title: "중간 점검", text: "설문 62명을 분석했다. QR 반납이 잘 안 돼서 안내문을 바꿨다. 선생님 피드백을 반영해 문구를 수정했다." },
    { id: "r3", title: "회고", text: "사람들의 습관을 바꾸는 게 어렵다는 걸 배웠다. 다음에는 반납 위치를 더 늘려 보고 싶다." },
  ],
  tags: [],
  ...over,
});

test("간단형: 모든 항목이 채워지고 출처가 붙는다 (AI 없이도 빈 서식이 아님)", () => {
  const c = fillMissing(undefined, src(), "simple");
  assert.equal(c.intro, "교내 일회용컵 줄이기");
  assert.equal(c._src?.intro, "info");
  // 간단형 "결과"는 결과 표현만 찾는다 (이 기록에는 결과 문장이 없어 비어 있는 게 맞다, D015). 배움은 "배운 점"으로
  for (const k of ["problem", "role", "process", "learn"] as const) {
    assert.ok(c[k], `${k} 비어 있음`);
    assert.equal(c._src?.[k], "record");
  }
});

test("발췌는 기록 문장을 고치지 않고 옮기며 같은 문장을 두 항목에 쓰지 않는다", () => {
  const s = src();
  const c = fillMissing(undefined, s, "detailed");
  const all = s.records.map((r) => r.text).join(" ");
  const lines = DETAILED_KEYS.flatMap((k) => (c[k] ? c[k]!.split("\n") : []));
  for (const l of lines) assert.ok(all.includes(l), `원문에 없는 문장: ${l}`);
  assert.equal(new Set(lines).size, lines.length);
});

test("AI 초안 → 개요 → 기록 순서로 채운다", () => {
  const s = src({ overview: { problem: "개요의 문제", role: "개요의 역할", process: "개요의 과정", reflection: "개요의 회고" } });
  const c = fillMissing(undefined, s, "simple", { ai: { problem: "AI 문제", role: "", result: "AI 결과" } });
  // 주 출처가 맨 앞에 오고, 같은 항목 표현의 기록 원문 문장이 뒤에 붙는다 (D011)
  // 간단형은 압축: AI 초안에는 발췌를 덧붙이지 않는다 (D015)
  assert.equal(c.problem, "AI 문제"); assert.equal(c._src?.problem, "ai");
  assert.ok(c.role!.startsWith("개요의 역할")); assert.equal(c._src?.role, "overview+record");
  assert.ok(c.process!.startsWith("개요의 과정"));
  assert.ok(c.result!.startsWith("AI 결과"));
});

test("근거가 없으면 비워 두고 출처를 붙이지 않는다 (추측해서 채우지 않음)", () => {
  const c = fillMissing(undefined, src({ topic: null, records: [{ id: "r", title: "사진", text: "" }] }), "detailed");
  for (const k of DETAILED_KEYS) { assert.equal(c[k], ""); assert.equal(c._src?.[k], undefined); }
});

test("이미 있는 값(지운 빈 값 포함)은 덮어쓰지 않는다", () => {
  const before = { problem: "내가 고친 문제", role: "", _src: { problem: "edited" as const } };
  const c = fillMissing(before, src(), "simple", { ai: { problem: "AI", role: "AI 역할", result: "AI 결과" } });
  assert.equal(c.problem, "내가 고친 문제");
  assert.equal(c.role, "");
  assert.ok(c.result!.startsWith("AI 결과"));
});

test("다시 채우기는 직접 고친 항목을 남긴다", () => {
  let c = fillMissing(undefined, src(), "simple");
  c = edit(c, "role", "직접 쓴 역할");
  assert.equal(editedCount(c, "simple"), 1);
  const r = refill(c, src(), "simple", { ai: { problem: "새 AI 문제" } });
  assert.equal(r.role, "직접 쓴 역할");
  assert.ok(r.problem!.startsWith("새 AI 문제"));
});

test("형식을 바꿔도 다른 형식의 글은 그대로 남는다", () => {
  const simple = edit(fillMissing(undefined, src(), "simple"), "problem", "간단형 문제");
  const both = fillMissing(simple, src(), "detailed", { prior: { problem: simple.problem } });
  for (const k of SIMPLE_KEYS) assert.equal(both[k], simple[k]);
  assert.ok(both.d_problem!.startsWith("간단형 문제"));
  assert.match(both._src?.d_problem ?? "", /^simple/);
});

test("pickSentences: 짧은 조각과 이미 쓴 문장은 건너뛴다", () => {
  const used = new Set(["나는 설문 문항을 맡았다."]);
  assert.deepEqual(pickSentences(src().records, /맡았/u, used), []);
});

test("증빙 기본값: 결과물·파일·링크만, 대표 이미지는 사진 파일", () => {
  const files: FileInfo[] = [
    { id: "a", title: "메모", kind: "memo", recorded_at: "", has_file: false, url: null, is_result: false },
    { id: "b", title: "사진", kind: "photo", recorded_at: "", has_file: true, url: null, is_result: false },
    { id: "c", title: "발표", kind: "slides", recorded_at: "", has_file: true, url: null, is_result: true },
  ];
  assert.deepEqual(defaultEvidence(files), ["c", "b"]);
  const c = withEvidenceDefaults({ evidence: ["a"] }, files);
  assert.deepEqual(c.evidence, ["a"]);
  assert.equal(c.cover, "b");
});

test("대체서식 활동내용: 개요 문장을 100자 안에서 잇고, 자르지 않는다", () => {
  const s = src({ overview: { activity: "설문 62명을 조사함.", process: "QR 반납 안내문을 만듦.", result: "가".repeat(120) } });
  const r = altContent(s)!;
  assert.equal(r.text, "설문 62명을 조사함. QR 반납 안내문을 만듦.");
  assert.equal(r.origin, "overview");
  assert.equal(altContent(src({ overview: { activity: "나".repeat(130) } }))!.text.length, 130);
});

test("대체서식 점검: 글자 수 초과와 기관명", () => {
  assert.deepEqual(altWarnings("짧은 글"), []);
  assert.equal(altWarnings("가".repeat(105))[0], "5자 넘어요");
  assert.match(altWarnings("거꾸로캠퍼스에서 진행함.")[0], /기관명/);
});

test("보강 문장도 원문 그대로이고, 주 출처가 없는 항목은 발췌만 쓴다", () => {
  const s = src({ overview: { process: "개요의 과정" } });
  const c = fillMissing(undefined, s, "detailed");
  const all = s.records.map((r) => r.text).join(" ");
  const extra = c.d_process!.split("\n\n")[1]?.split("\n") ?? [];
  assert.ok(extra.length > 0);
  for (const l of extra) assert.ok(all.includes(l));
  assert.equal(c._src?.d_trial, "record");
});

test("상세형: 키워드 나열인 개요 역할은 '담당:' 한 줄 + 기록 문장, 목표·의사결정 항목도 채운다", () => {
  const s = src({ overview: { role: "설문 설계 · 데이터 정리", activity: "설문·인터뷰" } });
  s.records.push({ id: "r9", title: "5차 회의록", text: "반납대는 급식실 앞에 두기로 결정했다. 이번 학기 목표는 반납률을 확인하는 것이다." });
  const c = fillMissing(undefined, s, "detailed");
  assert.ok(c.d_role!.startsWith("담당: 설문 설계 · 데이터 정리"));
  assert.match(c.d_role!, /맡았다/);
  assert.ok(c.d_goal!.startsWith("접근 방식: 설문·인터뷰"));
  assert.match(c.d_decision ?? "", /결정했다/);
});

test("간단형은 압축, 상세형은 더 많은 기록 문장을 쓴다 (같은 데이터)", () => {
  const s = src({ overview: { process: "개요의 과정" } });
  const simple = fillMissing(undefined, s, "simple"), detailed = fillMissing(undefined, s, "detailed");
  const len = (c: Record<string, unknown>, keys: readonly string[]) => keys.reduce((n, k) => n + String(c[k] ?? "").length, 0);
  assert.ok(len(detailed, DETAILED_KEYS) > len(simple, SIMPLE_KEYS));
});

test("성찰·향후 방향이 아닌 항목에는 배움·다음 계획 문장을 넣지 않는다", () => {
  const s = src({ records: [{ id: "x", title: "회고", text: "문제를 좁혀 가는 과정에서 근거로 말하는 법을 배웠다. 급식실 앞 컵이 많아 불편하다는 문제가 있었다." }] });
  const c = fillMissing(undefined, s, "detailed");
  assert.doesNotMatch(c.d_problem ?? "", /배웠다/);
  assert.match(c.d_learning ?? "", /배웠다/);
});
