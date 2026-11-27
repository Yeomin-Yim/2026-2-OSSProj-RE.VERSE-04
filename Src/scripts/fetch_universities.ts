// 추천 학과의 개설 대학을 커리어넷 학과 정보(schl)에서 가져와 universities 표에 넣는다.
// 학과 점수표(major_profiles)에 있는 code(커리어넷 학과 seq) 마다 다시 받아 통째로 바꾼다 (여러 번 돌려도 같음).
// 실행 (Src 폴더에서): node --env-file=.env.local --experimental-strip-types scripts/fetch_universities.ts
import { createClient } from "@supabase/supabase-js";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { data: majors, error } = await db.from("major_profiles").select("code, name");
if (error) throw new Error(error.message);
const codes = [...new Map(majors.map((m) => [m.code, m.name])).entries()];
const today = new Date().toISOString().slice(0, 10);

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
