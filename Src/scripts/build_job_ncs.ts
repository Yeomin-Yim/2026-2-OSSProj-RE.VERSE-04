// 직업마다 공공기관 공고를 찾을 "NCS 분야 + 공고 제목 단어"를 AI 로 한 번 만들어 career_catalog.extra 에 저장한다 (판단기록 D36).
//   이유: 공고 매칭 규칙(lib/core/postings/public.ts RULES)은 손으로 쓴 26줄이라 직업 552개 중 일부만 걸린다.
//   한 번 만들면 재사용 (extra.ncs 가 있으면 건너뜀, --force 면 다시). 40개씩 묶어 AI 1회.
// 실행 (Src 폴더): node --env-file=.env.local --experimental-strip-types scripts/build_job_ncs.ts [--force]
import { createClient } from "@supabase/supabase-js";
import { callJson } from "../lib/server/openai.ts";

const NCS: Record<string, string> = {
  R600001: "사업관리", R600002: "경영·회계·사무", R600003: "금융·보험", R600004: "교육·자연·사회과학", R600005: "법률·경찰·소방·교도·국방",
  R600006: "보건·의료", R600007: "사회복지·종교", R600008: "문화·예술·디자인·방송", R600009: "운전·운송", R600010: "영업판매",
  R600011: "경비·청소", R600012: "이용·숙박·여행·오락·스포츠", R600013: "음식서비스", R600014: "건설", R600015: "기계", R600016: "재료",
  R600017: "화학", R600018: "섬유·의복", R600019: "전기·전자", R600020: "정보통신", R600021: "식품가공", R600022: "인쇄·목재·가구·공예",
  R600023: "환경·에너지·안전", R600024: "농림어업", R600025: "연구",
};
const force = process.argv.includes("--force");
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { data, error } = await db.from("career_catalog").select("code, name, summary, extra").eq("kind", "job").range(0, 1999);
if (error) throw new Error(error.message);
const todo = (data ?? []).filter((r) => force || !(r.extra as any)?.ncs);
console.log(`직업 ${data?.length} · 만들 것 ${todo.length}`);

const SCHEMA = {
  type: "object", additionalProperties: false, required: ["items"],
  properties: { items: { type: "array", items: { type: "object", additionalProperties: false, required: ["code", "ncs", "words"],
    properties: { code: { type: "string" }, ncs: { type: "array", items: { type: "string", enum: Object.keys(NCS) } }, words: { type: "array", items: { type: "string" } } } } } },
};
let tokens = 0;
for (let i = 0; i < todo.length; i += 40) {
  const part = todo.slice(i, i + 40);
  const prompt = [
    "공공기관 채용공고(잡알리오)에서 아래 각 직업과 맞는 공고를 찾으려 합니다. 직업마다:",
    "- ncs: 이 직업이 속하는 NCS 대분류 코드 1~2개 (가장 맞는 것부터).",
    "- words: 공공기관 공고 '제목'에 실제로 쓰일 법한 직무 단어 2~5개. 짧게(2~6자), 넓은 말(정보·시스템·관리·지원·업무·직원)은 쓰지 말 것.",
    "  예) 간호사 → [\"간호\"], 정보보호전문가 → [\"정보보호\",\"보안\",\"관제\"], 재활용코디네이터 → [\"재활용\",\"자원순환\",\"폐기물\"], 학예사 → [\"학예\",\"전시\",\"박물관\"]",
    "  공공기관에서 거의 뽑지 않는 직업이면 words 는 가장 가까운 공공 직무 단어로.",
    "",
    "[NCS 대분류] " + Object.entries(NCS).map(([k, v]) => `${k}=${v}`).join(", "),
    "",
    "[직업]",
    ...part.map((r) => `- code=${r.code} | ${r.name} | ${String(r.summary).slice(0, 80)}`),
  ].join("\n");
  const { json, usage } = await callJson<{ items: { code: string; ncs: string[]; words: string[] }[] }>("job_ncs", SCHEMA, [{ type: "input_text", text: prompt }], "low");
  tokens += usage.input_tokens + (usage as { output_tokens?: number }).output_tokens!;
  const byCode = new Map(json.items.map((x) => [x.code, x]));
  for (const r of part) {
    const x = byCode.get(r.code);
    if (!x || !x.ncs.length) { console.warn("빠짐:", r.name); continue; }
    const words = [...new Set(x.words.map((w) => w.trim()).filter((w) => w.length >= 2 && w.length <= 8))].slice(0, 5);
    const { error: e } = await db.from("career_catalog").update({ extra: { ...(r.extra as object), ncs: x.ncs.slice(0, 2), words } }).eq("kind", "job").eq("code", r.code);
    if (e) throw new Error(e.message);
  }
  console.log(`  ${Math.min(i + 40, todo.length)}/${todo.length}`);
}
console.log(`끝. 토큰 약 ${tokens}`);
