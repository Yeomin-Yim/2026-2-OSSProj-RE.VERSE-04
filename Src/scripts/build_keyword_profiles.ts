// 학과·직무 점수표를 커리어넷 원문에서 자동으로 만든다 (자체 키워드 방식).
// 사람이 태그 코드·중요도를 고르지 않는다: 원문을 학생 기록과 같은 키워드 파이프라인에 통과시키고,
// 키워드(1층)를 공통 축(2층)에 붙인 뒤, 축마다 AI 중요도(high 3 / medium 2 / low 1)의 최댓값을 점수표 무게로 쓴다.
// 축 코드는 규칙 사전 코드와 같아서 학생의 예전 규칙 태그와도 계산된다. 이때 나온 키워드가 사전의 첫 씨앗이 된다.
// 1) 0008_keywords.sql 2) 0009_keyword_axes.sql 을 먼저 적용한다.
//
// 준비
//   1) supabase/migrations/0008_keywords.sql 적용
//   2) 점수표 검토 엑셀의 profiles 시트를 "CSV UTF-8"로 저장 (열: code, name, 구분, 원문 링크, 원문 발췌, 수집일)
//   3) Src/.env.local 에 NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY
//
// 실행 (Src 폴더에서)
//   node --env-file=.env.local --experimental-strip-types scripts/build_keyword_profiles.ts profiles.csv [--version kw-2026-11-27] [--dry-run] [--only 569,591]
//   --dry-run : 점수표는 저장하지 않고 결과만 보여 준다 (키워드 사전은 이때도 채워진다)
//
// 결과: major_profiles / job_profiles 에 profile_version = kw-날짜 로 저장.
//       추천 화면은 code 마다 가장 최근 버전을 쓰므로, 예전 초안(2026-11-23-draft-…)보다 이 버전이 쓰인다.

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { axisWeights, IMPORTANCE_WEIGHT, PIPELINE_VERSION } from "../lib/core/keywords/index.ts";
import type { RuleDict } from "../lib/core/types.ts";
import { loadAxisVectors, ruleAxisHints } from "../lib/server/keywords/axes.ts";
import { toSentences } from "../lib/core/sentences.ts";
import { embedTexts } from "../lib/server/openai.ts";
import { JUDGE_VERSION, judgeWithOpenAI } from "../lib/server/keywords/judge.ts";
import { runKeywordPipeline } from "../lib/server/keywords/pipeline.ts";
import { supabaseKeywordStore } from "../lib/server/keywords/store.ts";

const args = process.argv.slice(2);
const option = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const file = args.find((a, i) => !a.startsWith("--") && !["--version", "--only"].includes(args[i - 1] ?? ""));
if (!file) {
  console.error("사용법: build_keyword_profiles.ts profiles.csv [--version kw-날짜] [--dry-run] [--only code,code]");
  process.exit(1);
}
const dryRun = args.includes("--dry-run");
const version = option("--version") ?? `kw-${new Date().toISOString().slice(0, 10)}`;
const only = option("--only")?.split(",").map((s) => s.trim());

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key || !process.env.OPENAI_API_KEY) {
  console.error("NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY 가 필요해요 (--env-file=.env.local).");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });
const { data: dictRow, error: dictError } = await db.from("tag_dictionary").select("dict").eq("active", true).single();
if (dictError) throw new Error("규칙 사전을 읽지 못했어요: " + dictError.message);
const ruleDict = dictRow.dict as RuleDict;
const deps = { store: supabaseKeywordStore(db), embed: embedTexts, judge: judgeWithOpenAI, axes: () => loadAxisVectors(ruleDict, embedTexts), axisHints: ruleAxisHints(ruleDict) };

/** RFC 4180 CSV (supabase/seed/build_profiles.ts 와 같은 처리) */
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [[]];
  let cell = "", quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { rows.at(-1)!.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      rows.at(-1)!.push(cell); cell = ""; rows.push([]);
    } else cell += c;
  }
  rows.at(-1)!.push(cell);
  const [head, ...body] = rows.filter((r) => r.some((v) => v.trim()));
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? "").trim()])));
}

// 입력: 점수표 검토 엑셀 CSV, 또는 zz_local/keyword-lab/fetch_careernet.ts 가 만든 JSON ([{code, name, kind: 학과|직무, url, text}])
const raw = readFileSync(file, "utf8");
const all = file.endsWith(".json")
  ? (JSON.parse(raw) as { code: string; name: string; kind: string; url: string; text: string; fetched_at?: string }[]).map((p) => ({
      code: p.code, name: p.name, "구분": p.kind, "원문 링크": p.url, "원문 발췌": p.text, "수집일": p.fetched_at ?? "",
    }) as Record<string, string>)
  : parseCsv(raw);
// 이어서 하기: 같은 버전으로 이미 저장된 code 는 건너뛴다 (--force 면 다시)
const done = new Set<string>();
if (!dryRun && !args.includes("--force")) {
  for (const table of ["major_profiles", "job_profiles"]) {
    const { data } = await db.from(table).select("code").eq("profile_version", version);
    for (const d of data ?? []) done.add(`${table}:${d.code}`);
  }
}
const tableOf = (r: Record<string, string>) => (r["구분"] === "직무" ? "job_profiles" : "major_profiles");
const rows = all.filter((r) => r.code && (!only || only.includes(r.code)) && !done.has(`${tableOf(r)}:${r.code}`));
const limit = Number(option("--limit") ?? Infinity);
if (done.size) console.log(`이미 저장된 ${done.size}개는 건너뜀`);
let aiTokens = 0;
const summary: string[] = [];

for (const r of rows.slice(0, limit)) {
  const kind = r["구분"] === "직무" ? "job" : "major";
  // 원문 발췌의 " || " 는 문단 구분 → 줄바꿈으로 바꿔 문장 나누기
  const text = (r["원문 발췌"] ?? "").replace(/\s*\|\|\s*/g, "\n");
  if (!text.trim()) {
    summary.push(`${r.name}: 원문 없음 → 건너뜀`);
    continue;
  }
  const sentences = toSentences(text, 0, 1);
  const result = await runKeywordPipeline({ mode: "profile", title: `${r.name} (${r["구분"]})`, sentences }, deps);
  aiTokens += (result.usage?.input_tokens ?? 0) + (result.usage?.output_tokens ?? 0);

  const byText = new Map(sentences.map((s) => [s.sid, s.text]));
  const weights = axisWeights(result.keywords);
  const source = {
    method: `${PIPELINE_VERSION}/${JUDGE_VERSION}`,
    keywords: result.keywords.map((k) => ({
      code: k.code,
      weight: IMPORTANCE_WEIGHT[k.importance],
      axes: k.axes,
      phrases: k.surfaces.map((s) => s.display),
      sentences: k.sids.map((sid) => byText.get(sid)).filter(Boolean),
    })),
    excerpt: r["원문 발췌"],
    problems: result.problems,
  };
  summary.push(`${r.name}: 축 ${Object.keys(weights).length}개 ${Object.entries(weights).map(([a, w]) => `${a}(${w})`).join(" ")} · 키워드 ${result.keywords.map((k) => `${k.canonical}[${k.axes.join("/")}]`).join(", ")}`);
  if (result.problems.length) summary.push(`  바로잡음: ${result.problems.join(" / ")}`);

  if (!dryRun) {
    const table = kind === "major" ? "major_profiles" : "job_profiles";
    const { error } = await db.from(table).upsert(
      {
        code: r.code,
        name: r.name,
        weights,
        source,
        source_url: r["원문 링크"] || null,
        fetched_at: r["수집일"] || new Date().toISOString().slice(0, 10),
        rule_version: PIPELINE_VERSION,
        profile_version: version,
      },
      { onConflict: "code,profile_version" },
    );
    if (error) throw new Error(`${r.name} 저장 실패: ${error.message}`);
  }
}

console.log(summary.join("\n"));
console.log(`\n${Math.min(rows.length, limit)}개 처리 (남은 ${Math.max(0, rows.length - limit)}개) · AI 토큰 ${aiTokens.toLocaleString()} · ${dryRun ? "저장 안 함(--dry-run)" : `저장: profile_version=${version}`}`);
