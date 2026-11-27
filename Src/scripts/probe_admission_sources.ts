// 모집요강 PDF 주소 찾기 (D38): 저장소는 캠퍼스가 있는 대학을 "단국대학교(죽전)"처럼 괄호로 적는다.
//   "원문 없음"이던 대학에 흔한 캠퍼스 이름을 붙여 주소가 있는지(200) 확인하고, 찾은 것을 sources_<연도>.json 에 저장한다.
//   본교 후보를 앞에 둔다: 이 순서대로 처음 찾은 것이 제1캠퍼스(커리어넷 기준)로 쓰인다.
// 실행 (Src): NODE_USE_ENV_PROXY=1 node --experimental-strip-types scripts/probe_admission_sources.ts [--year 2027]
import { existsSync, readFileSync, writeFileSync } from "node:fs";
const YEAR = Number(process.argv.includes("--year") ? process.argv[process.argv.indexOf("--year") + 1] : 2027);
const DIR = new URL(`../../zz_local/admissions/${YEAR}/`, import.meta.url);
const state = JSON.parse(readFileSync(new URL("state.json", DIR), "utf8")) as Record<string, { status: string }>;
const OUT = new URL(`../sources_${YEAR}.json`, DIR);
const found: Record<string, { suffix: string; url: string }[]> = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : {};
export const MAIN_FIRST = ["서울", "서울캠퍼스", "죽전", "신촌", "본교", "글로벌", "인문", "안암", "수원", "용인", "성남", "의정부", "인천", "대전", "대구", "부산", "광주", "전주", "청주", "춘천", "강릉", "원주", "천안", "아산", "세종", "충주", "경산", "경주", "포항", "창원", "진주", "목포", "순천", "익산", "안성", "메디컬", "자연", "제2캠퍼스"];
const url = (u: string, s: string) => `https://cdn013.negagea.net/dgsmidc/omr/seoul/web/univ_info${YEAR - 1}/${encodeURIComponent(`${u}(${s})`)}/${encodeURIComponent(`${u}(${s})_${YEAR}학년도_수시모집요강`)}.pdf`;
const todo = Object.entries(state).filter(([u, v]) => v.status === "no-pdf" && !found[u]).map(([u]) => u);
console.log(`찾을 대학 ${todo.length}곳 × 캠퍼스 이름 ${MAIN_FIRST.length}개`);
let hits = 0;
async function probe(u: string) {
  const list: { suffix: string; url: string }[] = [];
  for (let i = 0; i < MAIN_FIRST.length; i += 10) {
    const rs = await Promise.all(MAIN_FIRST.slice(i, i + 10).map(async (s) => {
      try { const r = await fetch(url(u, s), { method: "HEAD", redirect: "manual", signal: AbortSignal.timeout(10000) }); return r.status === 200 ? { suffix: s, url: url(u, s) } : null; } catch { return null; }
    }));
    list.push(...rs.filter((x): x is { suffix: string; url: string } => !!x));
  }
  found[u] = list;
  if (list.length) { hits++; console.log(`${u}: ${list.map((x) => x.suffix).join(", ")}`); }
}
for (let i = 0; i < todo.length; i += 8) {
  await Promise.all(todo.slice(i, i + 8).map(probe));
  writeFileSync(OUT, JSON.stringify(found, null, 1));
}
console.log(`찾음 ${hits} / ${todo.length}`);
