// 공공기관 채용공고 (공공데이터포털 「재정경제부_공공기관 채용정보 조회서비스」, 판단기록 D31·D32)
//   수집: Supabase 가 하루 1번(06:07) 스스로 받아 public_postings 표에 쌓는다 (supabase/migrations/0012_public_postings.sql)
//   읽기: 앱은 표만 읽는다. 고를 때는 짧은 칸만, 보여 줄 공고만 본문·첨부까지 다시 읽는다 (전체 본문은 2.5MB)
//   표가 비어 있으면(마이그레이션 전) DATA_GO_KR_KEY 로 API 를 직접 부른다 — 이때만 서버 메모리 캐시

import { pickForJob, toPublicPosting, jobNcs, mergeRule, type AlioRow, type PublicPosting } from "@/lib/core/index.ts";
import type { Db } from "../auth";

export interface PostingFile { name: string; url: string; kind: "공고문" | "지원서 양식" | "직무설명" | "기타" }
export type PublicPostingWithFiles = PublicPosting & { files: PostingFile[] };

const KIND: Record<string, PostingFile["kind"]> = { A: "공고문", B: "지원서 양식", C: "직무설명" };
const ORDER: PostingFile["kind"][] = ["공고문", "지원서 양식", "직무설명", "기타"];
/** 고르는 데 필요한 칸 (긴 본문 제외) */
const LIGHT = [
  "recrutPblntSn", "instNm", "recrutPbancTtl", "ncsCdLst", "recrutSe", "acbgCondLst",
  "pbancBgngYmd", "pbancEndYmd", "ongoingYn",
] as const;
const LIGHT_TTL_MS = 10 * 60 * 1000;

let light: { at: number; rows: AlioRow[] } | null = null;
let fallback: { at: number; rows: AlioRow[] } | null = null;

export function toFiles(raw: unknown): PostingFile[] {
  return ((Array.isArray(raw) ? raw : []) as { atchFileNm?: string; atchFileType?: string; url?: string }[])
    .filter((f) => typeof f.url === "string" && f.url.startsWith("https://"))
    .map((f) => ({ name: String(f.atchFileNm ?? "첨부"), url: f.url!, kind: KIND[f.atchFileType ?? ""] ?? "기타" }))
    .sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind))
    .slice(0, 4);
}

const today = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10).replaceAll("-", "");

/** 진행 중 공고의 짧은 칸 (표에서, 10분 메모리) */
async function lightRows(db: Db): Promise<AlioRow[]> {
  if (light && Date.now() - light.at < LIGHT_TTL_MS) return light.rows;
  const cols = ["sn", ...LIGHT.map((k) => `${k}:data->>${k}`)].join(",");
  const since = new Date(Date.now() - 50 * 3600e3).toISOString();
  const { data, error } = await db.from("public_postings").select(cols).gte("seen_at", since).gte("data->>pbancEndYmd", today()).limit(2000);
  if (error) {
    // 표가 아직 없을 때(0012 전) 등은 빈 목록 → 아래에서 API 직접 호출
    console.warn("공공기관 공고 표를 읽지 못했어요:", error.message);
    return [];
  }
  const rows = (data as unknown as Record<string, string>[]).map((r) => ({ ...r, recrutPblntSn: Number(r.recrutPblntSn ?? r.sn) }) as unknown as AlioRow);
  light = { at: Date.now(), rows };
  return rows;
}

/** 표가 비었을 때만: API 를 직접 (3시간 메모리) */
async function apiRows(key = process.env.DATA_GO_KR_KEY): Promise<AlioRow[]> {
  if (!key) return [];
  if (fallback && Date.now() - fallback.at < 3 * 3600e3) return fallback.rows;
  try {
    const res = await fetch(`https://apis.data.go.kr/1051000/recruitment/list?serviceKey=${encodeURIComponent(key)}&resultType=json&ongoingYn=Y&numOfRows=1000&pageNo=1`, { signal: AbortSignal.timeout(8000) });
    const body = await res.json();
    if (!res.ok || body.resultCode !== 200) throw new Error(`오류 ${body.resultCode ?? res.status}`);
    fallback = { at: Date.now(), rows: body.result ?? [] };
    return fallback.rows;
  } catch (e) {
    console.warn("공공기관 채용공고를 가져오지 못했어요:", e instanceof Error ? e.message : "");
    return fallback?.rows ?? [];
  }
}

/**
 * 추천 직무들에 붙일 공공기관 공고 (직무마다 최신순 limit 건).
 * 직무 여러 개를 한 번에: 짧은 칸 1번 + 고른 공고 본문 1번만 읽는다.
 */
export async function publicPostingsForJobs(db: Db, jobs: { name: string; code?: string }[], limit = 5): Promise<{ items: PublicPostingWithFiles[]; total: number }[]> {
  const jobNames = jobs.map((j) => j.name);
  // 직업별 AI 생성 규칙 (scripts/build_job_ncs.ts)
  const codes = jobs.map((j) => j.code).filter((c): c is string => !!c);
  const gen = new Map<string, { ncs: string[]; words: string[] }>();
  if (codes.length) {
    const { data } = await db.from("career_catalog").select("code, extra").eq("kind", "job").in("code", codes);
    for (const r of (data ?? []) as { code: string; extra: { ncs?: string[]; words?: string[] } }[]) {
      if (r.extra?.ncs?.length) gen.set(r.code, { ncs: r.extra.ncs, words: r.extra.words ?? [] });
    }
  }
  const ruleOf = (i: number) => (jobs[i].code ? gen.get(jobs[i].code!) ?? null : null);
  let rows = await lightRows(db);
  const fromDb = rows.length > 0;
  if (!fromDb) rows = await apiRows();
  if (!rows.length) return jobNames.map(() => ({ items: [], total: 0 }));

  const picks = jobNames.map((name, i) => pickForJob(rows, name, limit, undefined, ruleOf(i)));
  if (!fromDb) return picks.map((p) => ({ items: p.items.map((x) => ({ ...x, files: [] })), total: p.total }));

  // 고른 공고만 본문·첨부까지
  const sns = [...new Set(picks.flatMap((p) => p.items.map((x) => Number(x.id))))];
  const full = new Map<string, { data: AlioRow; files: unknown }>();
  if (sns.length) {
    const { data, error } = await db.from("public_postings").select("sn, data, files").in("sn", sns);
    if (error) console.warn("공고 본문을 읽지 못했어요:", error.message);
    for (const r of (data ?? []) as { sn: number; data: AlioRow; files: unknown }[]) full.set(String(r.sn), r);
  }
  return picks.map((p, i) => {
    const hand = new Set(jobNcs(jobNames[i])?.words ?? []);
    const words = mergeRule(jobNcs(jobNames[i]), ruleOf(i))?.words ?? [];
    const strict = new Set(words.filter((w) => !hand.has(w) && w.length <= 2));
    return {
      total: p.total,
      items: p.items.map((x) => {
        const f = full.get(x.id);
        // 본문까지 다시 만들 때 relevance 는 고를 때 값을 유지 (흔한 말 걸러낸 결과)
        return f ? { ...toPublicPosting(f.data, words, strict), relevance: x.relevance, files: toFiles(f.files) } : { ...x, files: [] };
      }),
    };
  });
}
