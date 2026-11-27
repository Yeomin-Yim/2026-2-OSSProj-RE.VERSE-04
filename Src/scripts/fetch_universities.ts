// 학과의 개설 대학을 커리어넷 학과 정보(schl)에서 가져와 universities 표에 넣는다.
// 대상: career_catalog 의 학과 전체(약 500개, 판단기록 D35) + major_profiles. 학과마다 통째로 바꾼다 (여러 번 돌려도 같음).
// 이어 받기: 30일 안에 받은 학과는 건너뛴다 (--force 면 전부). 시간이 끊겨도 다시 돌리면 이어서 한다.
// 실행 (Src 폴더에서): node --env-file=.env.local --experimental-strip-types scripts/fetch_universities.ts [--force]
import { createClient } from "@supabase/supabase-js";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const force = process.argv.includes("--force");
const { data: majors, error } = await db.from("major_profiles").select("code, name");
if (error) throw new Error(error.message);
const { data: catalog, error: e2 } = await db.from("career_catalog").select("code, name").eq("kind", "major").range(0, 1999);
if (e2) throw new Error(e2.message);
const today = new Date().toISOString().slice(0, 10);
const recent = new Set<string>();
if (!force) {
  const since = new Date(Date.now() - 30 * 86400e3).toISOString().slice(0, 10);
  for (let f = 0; ; f += 1000) {
    const { data } = await db.from("universities").select("major_code").gte("fetched_at", since).range(f, f + 999);
    for (const r of data ?? []) recent.add(r.major_code);
    if (!data || data.length < 1000) break;
  }
}
const codes = [...new Map([...(catalog ?? []), ...majors].map((m) => [m.code, m.name])).entries()].filter(([c]) => !recent.has(c));
console.log(`받을 학과 ${codes.length} (최근에 받은 ${recent.size}개 건너뜀)`);

interface Schl { major_NM: string; univ_NM: string; campus_NM: string | null; area_NAME: string | null; univ_HMPG_URL: string | null }
let total = 0;
for (const [code, name] of codes) {
  const res = await fetch(`https://www.career.go.kr/cloud/api/major/uView?seq=${code}`, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) { console.log(`${name}: 커리어넷 ${res.status} → 건너뜀`); continue; }
  const j = await res.json();
  const list: Schl[] = (j.data ?? j).schl ?? [];
  // 같은 대학·학과·캠퍼스는 한 번만. 이름은 "대학 학과" (학생이 실제 학과 이름을 보도록)
  const rows = [...new Map(list.map((s) => [`${s.univ_NM}|${s.major_NM}|${s.campus_NM}`, s])).values()].map((s) => ({
    major_code: code,
    name: `${s.univ_NM} ${s.major_NM}`.trim(),
    campus: s.campus_NM || null,
    area: s.area_NAME || null,
    url: s.univ_HMPG_URL || null,
    fetched_at: today,
  }));
  const del = await db.from("universities").delete().eq("major_code", code);
  if (del.error) throw new Error(del.error.message);
  for (let i = 0; i < rows.length; i += 500) {
    const ins = await db.from("universities").insert(rows.slice(i, i + 500));
    if (ins.error) throw new Error(`${name}: ${ins.error.message}`);
  }
  total += rows.length;
  console.log(`${name}: ${rows.length}곳`);
}
console.log(`\n학과 ${codes.length}개 · 대학 ${total}곳 저장`);
