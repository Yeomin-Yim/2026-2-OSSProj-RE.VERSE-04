// 점수표(학과·직무)와 학과별 대학 목록을 DB에 넣는 SQL을 만든다.
//
// 준비: 엑셀(또는 구글 시트)의 시트를 "CSV UTF-8"로 저장
//   profiles.csv     : 점수표 검토 시트(profiles 시트). 첫 줄 제목 그대로
//                      code, name, 구분(학과|직무), 원문 링크, 원문 발췌, 태그코드:중요도, 맞은 구절, 사전 버전, 수집일,
//                      판단 기록, 메모, profile_version, 검토 상태 …
//   universities.csv : 첫 줄 major_code, name, campus, area, url, fetched_at
//                      (major_code = 점수표 학과 code, name = 대학 이름, 나머지는 비워도 됨)
//
// 실행 (Src 폴더에서):
//   node --experimental-strip-types ../supabase/seed/build_profiles.ts profiles.csv [universities.csv] [--draft] [--version 2026-12-01]
//   → supabase/seed/profiles.sql 이 생긴다. Supabase SQL Editor 에 붙여 넣고 Run.
//   --apply : SQL 파일 대신 바로 DB에 넣는다 (node --env-file=.env.local …, NEXT_PUBLIC_SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY 필요)
//
// 검토 상태에 "초안"이 들어간 줄은 넣지 않는다 (--draft 를 주면 넣음).
// 태그 코드가 사전에 없거나 중요도가 1~3이 아니면 SQL을 만들지 않고 멈춘다.
// 태그코드:중요도가 빈 줄은 어떤 기록과도 맞을 수 없어서 건너뛴다 (경고만).

import { readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const option = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const files = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--version");
if (!files[0]) {
  console.error("사용법: build_profiles.ts profiles.csv [universities.csv] [--draft] [--version 버전]");
  process.exit(1);
}

const here = (p: string) => new URL(p, import.meta.url);
const dict = JSON.parse(readFileSync(here("../../Doc/design/RE-Cord_규칙사전_v0.5.json"), "utf8"));

/** RFC 4180 CSV: 따옴표 안의 쉼표·줄바꿈·"" 처리 */
export function parseCsv(text: string): Record<string, string>[] {
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

/** "M17:3, T09:1" → {M17:3, T09:1} */
export function parseWeights(cell: string, where: string, errors: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const part of cell.split(/[,，]/).map((s) => s.trim()).filter(Boolean)) {
    const [code, w] = part.split(":").map((s) => s.trim());
    const weight = Number(w);
    if (!dict.tags[code]) errors.push(`${where}: 사전에 없는 태그 ${code}`);
    else if (![1, 2, 3].includes(weight)) errors.push(`${where}: ${code} 중요도 "${w}" (1~3만 가능)`);
    else out[code] = weight;
  }
  return out;
}

const q = (v: unknown) => (v === null || v === undefined || v === "" ? "null" : `'${String(v).replace(/'/g, "''")}'`);
const j = (v: unknown) => `$j$${JSON.stringify(v)}$j$::jsonb`;

const errors: string[] = [];
const sql: string[] = ["-- build_profiles.ts 가 만든 파일. 직접 고치지 말고 CSV를 고친 뒤 다시 만든다.", "begin;"];
const counts = { major: 0, job: 0, skipped: 0, universities: 0 };
const rows: Record<"major_profiles" | "job_profiles", object[]> = { major_profiles: [], job_profiles: [] };
let uniRows: Record<string, string | null>[] = [];

for (const [i, r] of parseCsv(readFileSync(files[0], "utf8")).entries()) {
  const where = `profiles ${i + 2}줄 (${r.name || r.code})`;
  if (!r.code) continue;
  if ((r["검토 상태"] ?? "").includes("초안") && !flag("--draft")) { counts.skipped++; continue; }
  const table = r["구분"] === "학과" ? "major_profiles" : r["구분"] === "직무" ? "job_profiles" : null;
  if (!table) { errors.push(`${where}: 구분은 학과 또는 직무`); continue; }
  if (!(r["태그코드:중요도"] ?? "").trim()) { console.warn(`${where}: 태그코드:중요도가 비어 있어 건너뜀`); counts.skipped++; continue; }
  const weights = parseWeights(r["태그코드:중요도"], where, errors);
  const version = option("--version") || r.profile_version;
  if (!version) errors.push(`${where}: profile_version 이 비어 있음 (--version 으로 지정 가능)`);

  const source = { excerpt: r["원문 발췌"], matched: r["맞은 구절"], note: r["메모"], judgement: r["판단 기록"], updated: r["원문 최종수정일"] };
  sql.push(`insert into public.${table} (code, name, weights, source, source_url, fetched_at, rule_version, profile_version) values
  (${q(r.code)}, ${q(r.name)}, ${j(weights)}, ${j(source)}, ${q(r["원문 링크"])}, ${q(r["수집일"])}, ${q(r["사전 버전"] || r.rule_version || dict.version)}, ${q(version)})
  on conflict (code, profile_version) do update set name = excluded.name, weights = excluded.weights, source = excluded.source,
    source_url = excluded.source_url, fetched_at = excluded.fetched_at, rule_version = excluded.rule_version;`);
  rows[table].push({ code: r.code, name: r.name, weights, source, source_url: r["원문 링크"] || null, fetched_at: r["수집일"] || null,
    rule_version: r["사전 버전"] || r.rule_version || dict.version, profile_version: version });
  counts[table === "major_profiles" ? "major" : "job"]++;
}

if (files[1]) {
  const unis = parseCsv(readFileSync(files[1], "utf8")).filter((u) => u.major_code && u.name);
  const codes = [...new Set(unis.map((u) => u.major_code))];
  // 대학 목록은 버전이 없어서, 이번에 넣는 학과의 목록을 지우고 다시 넣는다
  if (codes.length) sql.push(`delete from public.universities where major_code in (${codes.map(q).join(", ")});`);
  for (const u of unis) {
    sql.push(`insert into public.universities (major_code, name, campus, area, url, fetched_at) values (${q(u.major_code)}, ${q(u.name)}, ${q(u.campus)}, ${q(u.area)}, ${q(u.url)}, ${q(u.fetched_at)});`);
  }
  counts.universities = unis.length;
  uniRows = unis.map((u) => ({ major_code: u.major_code, name: u.name, campus: u.campus || null, area: u.area || null, url: u.url || null, fetched_at: u.fetched_at || null }));
}
sql.push("commit;");

if (errors.length) {
  console.error("SQL을 만들지 않았어요. 아래를 고쳐 주세요:\n- " + errors.join("\n- "));
  process.exit(1);
}
const summary = `학과 ${counts.major} · 직무 ${counts.job} · 대학 ${counts.universities} (초안·빈 줄이라 뺀 줄 ${counts.skipped})`;
if (flag("--apply")) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.error("--apply 에는 NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 가 필요해요 (--env-file=.env.local)."); process.exit(1); }
  const rest = async (path: string, method: string, body?: object[], prefer = "return=minimal") => {
    const res = await fetch(`${url}/rest/v1/${path}`, {
      method,
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: prefer },
      body: body && JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${method} ${path} 실패 (${res.status}): ${await res.text()}`);
  };
  for (const table of ["major_profiles", "job_profiles"] as const) {
    if (rows[table].length) await rest(`${table}?on_conflict=code,profile_version`, "POST", rows[table], "resolution=merge-duplicates,return=minimal");
  }
  if (uniRows.length) {
    // SQL 경로와 같다: 이번에 넣는 학과의 대학 목록을 지우고 다시 넣는다
    const codes = [...new Set(uniRows.map((u) => u.major_code))].map((c) => `"${c}"`).join(",");
    await rest(`universities?major_code=in.(${codes})`, "DELETE");
    await rest("universities", "POST", uniRows);
  }
  console.log(`DB에 넣었어요: ${summary}`);
} else {
  writeFileSync(here("./profiles.sql"), sql.join("\n") + "\n");
  console.log(`profiles.sql 생성: ${summary}`);
}
