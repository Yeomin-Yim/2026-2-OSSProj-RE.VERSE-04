// 커리어넷 학과·직업 전체를 career_catalog 에 올리고 임베딩을 붙인다 (판단기록 D33).
//   원문이 그대로면(body_hash 같음) 임베딩을 다시 계산하지 않는다 → 다시 돌려도 비용이 거의 없다.
// 순서: scripts/fetch_careernet_all.ts → (0013 적용) → 이 스크립트
// 실행 (Src 폴더): node --env-file=.env.local --experimental-strip-types scripts/upload_career_catalog.ts [../zz_local/keyword-lab/careernet_all.json]
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { EMBED_MODEL, embedTexts } from "../lib/server/openai.ts";

interface Row { kind: "major" | "job"; code: string; name: string; summary: string; text: string; url: string; extra: Record<string, unknown>; source_updated: string; fetched_at: string }

const file = process.argv.slice(2).find((a) => a.endsWith(".json")) ?? "../zz_local/keyword-lab/careernet_all.json";
const rows: Row[] = JSON.parse(readFileSync(file, "utf8"));
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

/** 임베딩에 넣는 글: 이름이 가장 중요하고, 원문은 앞부분(개요·하는 일)이 핵심이라 앞에서 자른다 */
export const embedInput = (r: { kind: string; name: string; summary: string; text: string }) =>
  `${r.kind === "major" ? "학과" : "직업"}: ${r.name}\n${r.summary}\n${r.text}`.slice(0, 2500);
const hash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);

const existing = new Map<string, string | null>();
for (let from = 0; ; from += 1000) {
  const { data, error } = await db.from("career_catalog").select("kind, code, body_hash, embed_model").range(from, from + 999);
  if (error) throw new Error(error.message);
  for (const r of data ?? []) existing.set(`${r.kind}:${r.code}`, r.embed_model === EMBED_MODEL ? r.body_hash : null);
  if (!data || data.length < 1000) break;
}

const todo = rows.filter((r) => existing.get(`${r.kind}:${r.code}`) !== hash(embedInput(r)));
console.log(`전체 ${rows.length} · 이미 최신 ${rows.length - todo.length} · 새로/바뀜 ${todo.length}`);

let tokens = 0;
for (let i = 0; i < todo.length; i += 100) {
  const part = todo.slice(i, i + 100);
  const { vectors, tokens: t } = await embedTexts(part.map(embedInput));
  tokens += t;
  const up = part.map((r, j) => ({
    kind: r.kind, code: r.code, name: r.name, summary: r.summary, body: r.text, url: r.url, extra: r.extra ?? {},
    source_updated: r.source_updated || null, fetched_at: r.fetched_at,
    body_hash: hash(embedInput(r)),
    embedding: vectors[j].map((v) => Math.round(v * 1e5) / 1e5),
    embed_model: EMBED_MODEL, embedded_at: new Date().toISOString(),
  }));
  const { error } = await db.from("career_catalog").upsert(up, { onConflict: "kind,code" });
  if (error) throw new Error(error.message);
  console.log(`  ${Math.min(i + 100, todo.length)}/${todo.length} 올림`);
}
console.log(`끝. 임베딩 토큰 ${tokens} (약 $${((tokens / 1e6) * 0.02).toFixed(4)})`);
