// 커리어넷 학과·직업 전체를 모은다 (판단기록 D33). 공개 페이지가 쓰는 JSON 을 그대로 읽는다 (키 불필요).
//   목록: POST /cloud/api/major/uSearch?page=0&size=200, /cloud/api/job/search?page=…  (한 쪽 최대 200건)
//   본문: GET  /cloud/api/major/uView?seq=, /cloud/api/job/view?seq=
// 이어 받기: 결과 파일에 이미 있고 원문 수정일이 같으면 다시 받지 않는다 (--force 면 전부 다시)
// 실행 (Src 폴더): node --experimental-strip-types scripts/fetch_careernet_all.ts [출력.json] [--force] [--only major|job]
// 결과를 DB(career_catalog)에 올리기: scripts/upload_career_catalog.ts
import { existsSync, readFileSync, writeFileSync } from "node:fs";

export interface CatalogRow {
  kind: "major" | "job";
  code: string;
  name: string;
  summary: string;
  text: string;
  url: string;
  extra: Record<string, unknown>;
  source_updated: string;
  fetched_at: string;
}

const args = process.argv.slice(2);
const out = args.find((a) => a.endsWith(".json")) ?? "../zz_local/keyword-lab/careernet_all.json";
const force = args.includes("--force");
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;

const BASE = "https://www.career.go.kr/cloud";
const clean = (s: unknown) => String(s ?? "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function call(path: string, body?: unknown): Promise<any> {
  for (let i = 0; ; i++) {
    try {
      const res = await fetch(BASE + path, {
        method: body ? "POST" : "GET",
        headers: { Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (i >= 3) throw e;
      await sleep(2000 * (i + 1));
    }
  }
}

async function list(path: string): Promise<any[]> {
  const all: any[] = [];
  // 쪽 번호는 주소(page=0부터)로 준다. 본문의 pageIndex 는 무시되고 한 쪽은 최대 200건
  for (let page = 0; ; page++) {
    const j = await call(`${path}?page=${page}&size=200`, {});
    const c = j.content ?? [];
    all.push(...c);
    if (!c.length || all.length >= (j.totalElements ?? 0)) break;
    await sleep(200);
  }
  return all;
}

const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const prev: CatalogRow[] = existsSync(out) ? JSON.parse(readFileSync(out, "utf8")) : [];
const have = new Map(prev.map((r) => [`${r.kind}:${r.code}`, r]));
const save = () => writeFileSync(out, JSON.stringify([...have.values()], null, 0));

if (only !== "job") {
  const majors = await list("/api/major/uSearch");
  console.log(`학과 목록 ${majors.length}`);
  let n = 0;
  for (const m of majors) {
    const code = String(m.seq);
    const old = have.get(`major:${code}`);
    if (old && !force) continue;
    try {
      const j = await call(`/api/major/uView?seq=${code}`);
      const d = j.data ?? j;
      const parts = [d.major_SUMRY, d.characteristics, d.interest,
        ...(d.careerAct ?? []).map((a: any) => `${clean(a.act_NAME)}: ${clean(a.act_DESCRIPTION)}`),
        ...(d.subject ?? []).map((s: any) => `${clean(s.subject_NAME)}: ${clean(s.subject_DESCRIPTION)}`),
        (d.job ?? d.jobs) ? `관련 직업: ${clean(d.job ?? d.jobs)}` : ""].map(clean).filter((x) => x && !/^[^:]+:\s*$/.test(x));
      have.set(`major:${code}`, {
        kind: "major", code, name: clean(d.major_NM ?? m.major_nm), summary: clean(m.major_sumry).slice(0, 300),
        text: parts.join(" || "), url: `${BASE}/w/major/uView?seq=${code}`,
        extra: { category: m.major_cl1 ?? null, univ_se: m.univ_se ?? null, empymn: m.empymn_code ?? null },
        source_updated: String(d.updt ?? ""), fetched_at: today,
      });
      if (++n % 25 === 0) { save(); console.log(`  학과 ${n} 저장`); }
    } catch (e) {
      console.warn(`학과 ${code} 실패:`, e instanceof Error ? e.message : e);
    }
    await sleep(250);
  }
  save();
  console.log(`학과 새로 받음 ${n}`);
}

if (only !== "major") {
  const jobs = await list("/api/job/search");
  console.log(`직업 목록 ${jobs.length}`);
  let n = 0;
  for (const m of jobs) {
    const code = String(m.job_cd);
    const old = have.get(`job:${code}`);
    if (old && !force && old.source_updated === String(m.edit_dt ?? "")) continue;
    try {
      const j = await call(`/api/job/view?seq=${code}`);
      const d = j.data ?? j;
      const parts = [...(d.jobWorkList ?? []), ...(d.jobAptitudeList ?? []), ...(d.jobInterestList ?? [])].map(clean).filter(Boolean);
      have.set(`job:${code}`, {
        kind: "job", code, name: clean(d.job_nm ?? m.job_nm), summary: clean(m.work).slice(0, 300),
        text: (parts.length ? parts : [clean(m.work)]).join(" || "), url: `${BASE}/w/job/view?seq=${code}`,
        extra: { related: clean(m.rel_job_nm) || null, top: clean(m.top_nm) || null, aptitude: clean(m.aptit_name) || null, wage: m.wage ?? null, wage_level: m.wage_level ?? null },
        source_updated: String(m.edit_dt ?? ""), fetched_at: today,
      });
      if (++n % 25 === 0) { save(); console.log(`  직업 ${n} 저장`); }
    } catch (e) {
      console.warn(`직업 ${code} 실패:`, e instanceof Error ? e.message : e);
    }
    await sleep(250);
  }
  save();
  console.log(`직업 새로 받음 ${n}`);
}
console.log(`끝: ${out} (${have.size}개)`);
