// 대학 수시 모집요강(PDF)에서 "검정고시·대안학교 출신이 지원할 수 있는 전형"을 뽑아 admission_rules 에 저장한다 (판단기록 D37).
//   1) 대학 목록: universities 표의 4년제(…대학교) 이름
//   2) 모집요강: cdn013.negagea.net 의 학년도별 수시모집요강 PDF (없으면 "원문 없음"으로 기록하고 건너뜀)
//   3) 쪽마다 글자를 뽑아 검정고시·대안학교·대체서식이 나오는 쪽만 골라 AI(gpt-5.4-mini) 1회로 전형별 표를 만든다
//   4) 출처 주소·PDF 쪽·확인일과 함께 저장. PDF 가 같으면(해시) 다시 뽑지 않는다
// 실행 (Src 폴더): NODE_USE_ENV_PROXY=1 node --env-file=.env.local --experimental-strip-types scripts/fetch_admissions.ts [--year 2027] [--limit 20] [--only 동국대학교] [--force]
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { callJson } from "../lib/server/openai.ts";

const args = process.argv.slice(2);
const opt = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const YEAR = Number(opt("--year") ?? 2027);
const LIMIT = Number(opt("--limit") ?? 1e9);
const ONLY = opt("--only")?.split(",");
const FORCE = args.includes("--force");
const DIR = new URL(`../../zz_local/admissions/${YEAR}/`, import.meta.url);
mkdirSync(DIR, { recursive: true });
const STATE = new URL("state.json", DIR);
const state: Record<string, { status: string; hash?: string; url?: string; rows?: number; at: string }> = existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : {};
const save = () => writeFileSync(STATE, JSON.stringify(state, null, 1));

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

// 캠퍼스가 괄호로 붙은 주소 등, 따로 찾은 주소 (scripts/probe_admission_sources.ts). 첫 번째 = 본교(제1캠퍼스)
const SOURCES_FILE = new URL(`../sources_${YEAR}.json`, DIR);
const sources: Record<string, { suffix: string; url: string; pages?: [number, number]; doc?: string }[]> = existsSync(SOURCES_FILE) ? JSON.parse(readFileSync(SOURCES_FILE, "utf8")) : {};
// 1) 대학 목록 (학과가 많은 대학부터: 추천에 더 자주 나온다)
const count = new Map<string, number>();
for (let f = 0; ; f += 1000) {
  const { data, error } = await db.from("universities").select("name").range(f, f + 999);
  if (error) throw new Error(error.message);
  for (const r of data ?? []) {
    const m = /^(\S*?대학교)(\s|$)/.exec(r.name);
    if (m) count.set(m[1], (count.get(m[1]) ?? 0) + 1);
  }
  if (!data || data.length < 1000) break;
}
let univs = [...count].sort((a, b) => b[1] - a[1]).map(([n]) => n);
if (ONLY) univs = univs.filter((u) => ONLY.includes(u)).concat(ONLY.filter((u) => !count.has(u)));
const todo = univs.filter((u) => FORCE || !state[u] || state[u].status === "error" || state[u].status === "no-mention" || state[u].status === "image-pdf" || (state[u].status === "no-pdf" && sources[u]?.length)).slice(0, LIMIT);
console.log(`4년제 ${univs.length}곳 · 이번에 ${todo.length}곳`);
// 비용 상한 (D40): 대학 1곳 ≈ 입력 3만 토큰(2회 추출). 60만 토큰(약 20곳)을 넘으면 --yes 가 있어야 실행
//   (검증하느라 전체를 반복 재추출하다 크레딧이 소진된 일이 있었다 — 판단기록 D39)
const EST = todo.filter((u) => state[u]?.status !== "no-pdf" || sources[u]?.length).length * 30_000;
if (EST > 600_000 && !args.includes("--yes")) {
  console.log(`예상 입력 약 ${(EST / 1e6).toFixed(1)}M 토큰. 정말 돌리려면 --yes 를 붙이세요 (정답 표본 회귀가 통과했는지 먼저 확인).`);
  process.exit(0);
}

const urlOfDefault = (u: string) => `https://cdn013.negagea.net/dgsmidc/omr/seoul/web/univ_info${YEAR - 1}/${encodeURIComponent(u)}/${encodeURIComponent(`${u}_${YEAR}학년도_수시모집요강`)}.pdf`;
const urlOf = (u: string) => sources[u]?.[0]?.url ?? urlOfDefault(u);
const campusOf = (u: string) => sources[u]?.[0]?.suffix ?? "";
const KEY = /검정고시|대안학교|대안교육|대체\s?서식|고교졸업\s?동등|학력인정/;

/** 이미지 PDF OCR: 150dpi JPEG 로 4쪽씩 AI 에 보내 원문 그대로 받아 적게 한다. 해시가 같으면 저장본 재사용 */
async function ocrPdf(u: string, path: string, hash: string, n: number): Promise<string[] | null> {
  const cacheFile = new URL(`${u}.ocr.json`, DIR);
  if (existsSync(cacheFile)) { const c = JSON.parse(readFileSync(cacheFile, "utf8")); if (c.hash === hash) return c.pages; }
  const { mkdtempSync, readdirSync } = await import("node:fs");
  const tmp = mkdtempSync("/tmp/adm-ocr-");
  execFileSync("pdftoppm", ["-r", "110", "-jpeg", "-jpegopt", "quality=70", path, `${tmp}/p`]);
  const files = readdirSync(tmp).filter((f) => f.endsWith(".jpg")).sort();
  const OCR_SCHEMA = { type: "object", additionalProperties: false, required: ["pages"], properties: { pages: { type: "array", items: { type: "object", additionalProperties: false, required: ["page", "text"], properties: { page: { type: "integer" }, text: { type: "string" } } } } } };
  const out: string[] = new Array(n).fill("");
  const batches: number[][] = [];
  for (let i = 0; i < files.length; i += 4) batches.push(files.slice(i, i + 4).map((_, j) => i + j));
  try {
    for (let b = 0; b < batches.length; b += 6) {
      await Promise.all(batches.slice(b, b + 6).map(async (idx) => {
        const content: object[] = [{ type: "input_text", text: "대학 모집요강 쪽 이미지입니다. 각 쪽의 글자를 표 안 글자까지 빠짐없이, 원문 그대로(요약·해석 없이) 줄 단위로 받아 적으세요. 표는 칸을 ' | '로 구분." }];
        for (const i of idx) content.push({ type: "input_text", text: `page ${i + 1}` }, { type: "input_image", image_url: `data:image/jpeg;base64,${readFileSync(`${tmp}/${files[i]}`).toString("base64")}`, detail: "high" });
        const { json } = await callJson<{ pages: { page: number; text: string }[] }>("adm_ocr", OCR_SCHEMA, content, "none");
        for (const p of json.pages) if (p.page >= 1 && p.page <= n) out[p.page - 1] = p.text;
      }));
    }
  } catch (e) {
    console.warn(`${u}: OCR 오류`, e instanceof Error ? e.message : e);
    return null;
  }
  writeFileSync(cacheFile, JSON.stringify({ hash, pages: out }));
  return out;
}

const SCHEMA = {
  type: "object", additionalProperties: false, required: ["tracks"],
  properties: { tracks: { type: "array", items: { type: "object", additionalProperties: false,
    required: ["track", "track_type", "ged_ok", "alt_form", "alt_school", "note", "pages"],
    properties: {
      track: { type: "string" },
      track_type: { type: "string", enum: ["종합", "교과", "실기", "논술", "기타"] },
      ged_ok: { type: ["boolean", "null"] },
      alt_form: { type: ["string", "null"], enum: ["필수", "선택", "없음", null] },
      alt_school: { type: "boolean" },
      note: { type: "string" },
      pages: { type: "array", items: { type: "integer" } },
    } } } },
};

const CONC = Number(opt("--conc") ?? 6);
async function one(u: string) {
  const url = urlOf(u);
  const pdf = new URL(`${u}.pdf`, DIR);
  try {
    // 예전에 받은 파일이 PDF 가 아니면(오류 페이지 등) 다시 받는다
    const isPdf = existsSync(pdf) && readFileSync(pdf).subarray(0, 5).toString() === "%PDF-";
    if (!isPdf || FORCE) {
      // 이 저장소에 파일이 없으면 다른 서버(IP, http)로 넘긴다 → 따라가지 않고 "원문 없음"으로 (다른 출처는 따로)
      const res = await fetch(url, { signal: AbortSignal.timeout(60000), redirect: "manual" });
      if (res.status === 404 || res.status === 403 || (res.status >= 300 && res.status < 400)) { state[u] = { status: "no-pdf", url, at: new Date().toISOString() }; save(); console.log(`${u}: 원문 없음`); return; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      writeFileSync(pdf, Buffer.from(await res.arrayBuffer()));
    }
    const buf = readFileSync(pdf);
    const hash = createHash("sha256").update(buf).digest("hex").slice(0, 16);
    if (!FORCE && state[u]?.hash === hash && state[u].status === "ok") { console.log(`${u}: 그대로`); return; }

    const text = execFileSync("pdftotext", ["-layout", "-q", fileURLToPath(pdf), "-"], { maxBuffer: 64 * 1024 * 1024 }).toString("utf8");
    // 출처 목록에 쪽 범위가 있으면 그 범위만 (여러 캠퍼스·정시가 한 파일에 섞인 시행계획 등)
    const range = sources[u]?.[0]?.pages;
    const pages = text.split("\f").map((t, i) => (range && (i + 1 < range[0] || i + 1 > range[1]) ? "" : t));
    // 글자가 거의 없는 PDF = 스캔 이미지 → 쪽을 그림으로 바꿔 AI 가 받아 적는다 (D39). 결과는 .ocr.json 에 저장해 다시 하지 않는다
    if (text.replace(/\s/g, "").length < pages.length * 50) {
      const ocr = await ocrPdf(u, fileURLToPath(pdf), hash, pages.length);
      if (!ocr) { state[u] = { status: "image-pdf", hash, url, at: new Date().toISOString() }; save(); console.log(`${u}: 이미지 PDF (OCR 실패)`); return; }
      pages.splice(0, pages.length, ...ocr);
      console.log(`${u}: 이미지 PDF → OCR ${ocr.length}쪽`);
    }
    // 쪽 압축 (D37 v2): 쪽마다 전형 제목 줄 + "지원자격" 뒤 8줄 + 검정고시·대체서식·대안 줄 앞뒤 2줄만.
    //   v1(핵심 말이 많은 쪽 10개 통째로)은 "지원자격" 쪽이 빠져 농어촌·실기처럼 "불가"인 전형을 놓쳤다 → 모든 지원자격을 빠짐없이 넣는다
    const pick = (t: string) => {
      const L = t.split("\n").map((l) => l.replace(/[ \t]{2,}/g, "  ").trim()).filter(Boolean);
      const keep = new Set<number>();
      L.forEach((l, j) => {
        // 전형 제목: "1. ○○전형", "■ …", "학생부종합(○○전형)(면접형)" 처럼 유형 이름으로 시작하는 줄 + 쪽 맨 위 3줄 (v4: 제목이 앞 쪽에만 있는 대학 대비)
        if ((/^(\d+\.|[❶-❿➊-➓■□Ⅰ-Ⅹ])\s*\S.{0,40}전형/.test(l) || /^(학생부종합|학생부교과|논술|실기|실기\/실적|학생부)\s*[\[(（]/.test(l)) && l.length < 90) keep.add(j);
        if (j < 3 && l.length < 90) keep.add(j);
        if (/지원\s*자격/.test(l)) for (let k = j; k < Math.min(L.length, j + 8); k++) keep.add(k);
        if (KEY.test(l)) for (let k = Math.max(0, j - 2); k < Math.min(L.length, j + 3); k++) keep.add(k);
      });
      return [...keep].sort((x, y) => x - y).map((j) => L[j].slice(0, 160)).join("\n");
    };
    // v5: 쪽을 넘겨도 "지금 읽는 전형"을 이어 붙인다 (제목은 17쪽, 지원자격은 18쪽인 대학 — 숭실대에서 발견)
    const TITLE = /^(?:\d+\.\s*|[❶-❿➊-➓■□]\s*)?((?:학생부종합|학생부교과|논술|실기\/실적|실기)\s*[\[(（][^\n]{1,40}?[\])）](?:\s*[\[(（][^\n]{1,15}[\])）])?)/;
    let current = "";
    const chosen = pages.map((t, i) => {
      const before = current;
      for (const l of t.split("\n")) { const m = TITLE.exec(l.trim()); if (m && l.trim().length < 90) current = m[1]; }
      const body = pick(t);
      return { i, t: body && before && !TITLE.test(body.split("\n").slice(0, 4).join("\n")) ? `[앞 쪽에서 이어지는 전형: ${before}]\n${body}` : body };
    }).filter((p) => p.t && (/지원\s*자격/.test(p.t) || KEY.test(p.t)));
    if (!chosen.length) { state[u] = { status: "no-mention", hash, url, at: new Date().toISOString() }; save(); console.log(`${u}: 검정고시 언급 없음`); return; }
    const excerpt = chosen.map((p) => `=== PDF ${p.i + 1}쪽 ===\n${p.t}`).join("\n\n").slice(0, 60000);
    if (process.env.DUMP_EXCERPT) writeFileSync(new URL(`${u}.excerpt.txt`, DIR), excerpt);
    const fullLen = chosen.map((p) => p.t.length + 20).reduce((a, b) => a + b, 0);
    if (process.env.DUMP_EXCERPT) console.log(`${u}: 발췌 ${fullLen}자${fullLen > 60000 ? " (잘림!)" : ""}`);
    const prompt = [
      `${u} ${YEAR}학년도 수시모집요강의 일부입니다. 이 대학의 수시 전형마다 다음을 표로 정리하세요.`,
      `판단 규칙 (반드시 따를 것):`,
      `- ged_ok = 한국 고졸 검정고시 출신자가 지원할 수 있는가.`,
      `  · "고등학교 졸업(예정)자 또는 법령에 의하여 (이와) 동등 이상의 학력이 있다고 인정된 자" → true (검정고시 포함).`,
      `  · "국내 고등학교 졸업(예정)자"만 있고 동등 학력 문구가 없음 → false. 학교장 추천이 필요 → false.`,
      `  · 농어촌·서해5도·특성화고 졸업 재직자처럼 고교 재학·이수가 조건이면, 원문이 검정고시를 명시적으로 허용하지 않는 한 false.`,
      `  · 원문에 "검정고시 … 지원할 수 없음/불가"가 있으면 false. "외국 검정고시 제외"는 한국 검정고시와 무관(→ 다른 문구로 판단).`,
      `  · 위로 판단할 수 없으면 null. 틀린 true 가 가장 해롭다(학생이 못 내는 전형에 지원하게 됨). 애매하면 null.`,
      `- alt_form: 검정고시 출신의 '학교생활기록부 대체서식' — "필수"는 원문에 '필수', '반드시 제출', '미제출 시 (지원)자격 미달/불합격'이 명시된 경우만.`,
      `  제출서류 표에 '선택'·'해당자'·'희망자'로 적혀 있거나 "대체서식을 활용(평가)한다"고만 적혀 있으면 "선택". 학생부종합이 아니라 해당 없으면 "없음", 언급 없으면 null.`,
      `- alt_school: 전형 자체가 대안학교(미인가 대안교육기관) 출신을 위한 전형일 때만 true (전형명에 '대안'이 들어가는 수준).`,
      `  "대안교육 특성화고는 지원 가능/불가" 같은 문구는 학력인정 학교 이야기라 alt_school 이 아님 → false.`,
      `- note: 학생이 알아야 할 조건 한 줄(40자 이내). 없으면 빈 문자열.  pages: 근거 PDF 쪽.`,
      `- 정원외 특별전형도 포함. track 은 원문 전형명 그대로. 원문에 없는 전형을 만들지 말 것.`,
      `- 빠뜨리지 말 것: 발췌에 나오는 전형 제목(학생부종합(○○), 학생부교과(○○), 논술, 실기…)마다 반드시 한 줄씩. 지원자격 문장이 제목 다음 쪽에 있어도 같은 전형입니다.`,
      `- 같은 전형 안에서 모집단위(학과)마다 지원자격이 다르면 반드시 나눠 쓰세요: track = "전형명(모집단위)". 하나라도 검정고시 불가인 모집단위를 가능한 것과 묶으면 안 됩니다.`,
      `- 논술·실기·교과처럼 학생부종합이 아니면 alt_form 은 "없음".`,
      ``,
      excerpt,
    ].join("\n");
    // v6 (자기 일관성): 같은 발췌로 2번 추출해 합친다. 전형 목록은 합집합(한 번 빠뜨려도 다른 번이 잡음),
    //   두 번의 판단이 다르면 null(확실하지 않음) → 흔들리는 판단이 "가능"으로 나가지 않는다 (부산대: 실행마다 10개 ↔ 21개)
    type T = { track: string; track_type: string; ged_ok: boolean | null; alt_form: string | null; alt_school: boolean; note: string; pages: number[] };
    const runs = await Promise.all([0, 1].map(() => callJson<{ tracks: T[] }>("admissions", SCHEMA, [{ type: "input_text", text: prompt }], "low")));
    const usage = { input_tokens: runs.reduce((a, r) => a + r.usage.input_tokens, 0) };
    // 같은 전형이 "학생부교과(참인재)" / "참인재" 처럼 이름만 달리 나와도 하나로 (유형 접두어·괄호·"전형" 떼고 비교, 한신대에서 발견)
    const key = (t: string) => t.replace(/^(학생부종합|학생부교과|학생부|논술|실기\/실적|실기)\s*/, "").replace(/전형/g, "").replace(/\s|[()\[\]_·‧,\-]/g, "");
    const merged = new Map<string, T & { seen: number }>();
    // 원문 전형명에 유형이 적혀 있으면 AI 분류보다 그것을 따른다 (한신대 "학생부교과(참인재)"를 한 번은 종합으로 분류)
    const typeFromName = (n: string) => (/^학생부종합|^\[?종합/.test(n) ? "종합" : /^학생부교과|^\[?교과/.test(n) ? "교과" : /^논술/.test(n) ? "논술" : /^실기/.test(n) ? "실기" : null);
    for (const r of runs) for (const t0 of r.json.tracks) {
      const t = { ...t0, track_type: typeFromName(t0.track.trim()) ?? t0.track_type };
      // 유형도 키에 넣는다: 접두어를 떼면 "학생부교과(추천형)"과 "학생부종합(추천형)"이 같은 키가 된다(한양대에서 발견)
      const k = t.track_type + ":" + key(t.track);
      const cur = merged.get(k);
      if (!cur) { merged.set(k, { ...t, seen: 1 }); continue; }
      cur.seen++;
      if (t.track.length > cur.track.length) cur.track = t.track;
      if (cur.ged_ok !== t.ged_ok) cur.ged_ok = null;
      if (cur.alt_form !== t.alt_form) cur.alt_form = null;
      cur.alt_school = cur.alt_school && t.alt_school;
      cur.pages = [...new Set([...cur.pages, ...t.pages])];
    }
    const json = { tracks: [...merged.values()].map((t) => ({ ...t, note: t.seen < 2 ? (t.note ? t.note + " · " : "") + "한 번만 추출됨" : t.note })) };
    const today = new Date().toISOString().slice(0, 10);
    const rows = [...new Map(json.tracks.map((t) => [t.track.trim(), t])).values()].map((t) => ({
      university: u, campus: campusOf(u), year: YEAR, track: t.track.trim().slice(0, 80), track_type: t.track_type,
      ged_ok: t.ged_ok, alt_form: t.alt_form, alt_school: t.alt_school, note: t.note.slice(0, 120),
      source_url: url, source_page: t.pages.length ? "PDF " + [...new Set(t.pages)].sort((a, b) => a - b).join(", ") + "쪽" : null,
      checked_at: today, extracted_by: "ai",
    }));
    const del = await db.from("admission_rules").delete().eq("university", u).eq("year", YEAR).eq("extracted_by", "ai");
    if (del.error) throw new Error(del.error.message);
    if (rows.length) { const ins = await db.from("admission_rules").insert(rows); if (ins.error) throw new Error(ins.error.message); }
    state[u] = { status: "ok", hash, url, rows: rows.length, at: new Date().toISOString() }; save();
    console.log(`${u}: 전형 ${rows.length} (검정고시 가능 ${rows.filter((r) => r.ged_ok).length}, 대안학교 ${rows.filter((r) => r.alt_school).length}) · 입력 ${usage.input_tokens}토큰`);
  } catch (e) {
    state[u] = { status: "error", url, at: new Date().toISOString() }; save();
    console.warn(`${u}: 실패 ${e instanceof Error ? e.message : e}`);
  }
}
for (let i = 0; i < todo.length; i += CONC) await Promise.all(todo.slice(i, i + CONC).map(one));
const all = Object.values(state);
console.log(`누적: ok ${all.filter((s) => s.status === "ok").length} · 원문 없음 ${all.filter((s) => s.status === "no-pdf").length} · 이미지 PDF ${all.filter((s) => s.status === "image-pdf").length} · 실패 ${all.filter((s) => s.status === "error").length}`);
