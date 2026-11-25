// 포트폴리오 작성 도우미 (AI 아님).
// 실제 AI 초안 생성은 아직 서버에 없다. 그래서 여기서는 "학생이 이미 저장한 값"을 칸에 그대로 옮겨 주기만 한다.
//   - 프로젝트 3섹션: 개요 6항목의 글을 고치지 않고 그대로 붙인다 (문장을 새로 만들지 않음)
//   - 대체서식 행: 프로젝트 이름과 기간만 채운다 (활동내용은 학생이 직접)
//   - 프로필: 기록에서 찾은 태그 이름만 스킬 칸에 넣는다
// buildPrompt 는 AI 를 붙일 때 보낼 지시문이다. 화면의 "프롬프트 보기"로 확인할 수 있다.

import { TEMPLATES, type Template, type TemplateId, type TemplateSection } from "./templates.ts";

export interface PortfolioSource {
  id: string;
  title: string;
  topic: string | null;
  start_date: string | null;
  end_date: string | null;
  /** 개요 6항목 (role · activity · problem · process · result · reflection) */
  overview: Record<string, string>;
  /** 기록 제목과 본문 */
  records: { id: string; title: string; text: string }[];
  /** 이 프로젝트 기록에서 찾은 태그 이름 (많이 나온 순) */
  tags: string[];
}

export interface ProjectDraft { problem: string; role: string; result: string }
export interface AltRow { pid: string; name: string; period: string; content: string; org: string; page: string }
export interface ProfileDraft {
  slogan: string; education: string; link: string; skills: string;
  motivation: string; aspiration: string; awards: string;
}

export const PROJECT_SECTIONS = ["problem", "role", "result"] as const;
export const emptyDraft = (): ProjectDraft => ({ problem: "", role: "", result: "" });
export const emptyAltRow = (): AltRow => ({ pid: "", name: "", period: "", content: "", org: "", page: "" });
export const emptyProfile = (): ProfileDraft => ({ slogan: "", education: "", link: "", skills: "", motivation: "", aspiration: "", awards: "" });

const dot = (s: string) => s.slice(0, 10).replaceAll("-", ".");
const ym = (s: string | null) => (s ? s.slice(0, 7).replace("-", ".") : "");
export const period = (p: Pick<PortfolioSource, "start_date" | "end_date">) =>
  !p.start_date && !p.end_date ? "기간 미입력" : `${ym(p.start_date)} – ${ym(p.end_date)}`;

/** 개요에 저장된 글을 섹션 칸으로 그대로 옮긴다 (빈 항목은 건너뜀, 글은 바꾸지 않음) */
export function draftFromOverview(o: Record<string, string>): ProjectDraft {
  const join = (...keys: string[]) => keys.map((k) => (o[k] ?? "").trim()).filter(Boolean).join("\n\n");
  return { problem: join("problem"), role: join("role", "process"), result: join("result", "reflection") };
}

/** 대체서식 목록표 한 행: 이름·기간만 채운다 */
export function altRow(p: PortfolioSource): AltRow {
  return {
    ...emptyAltRow(),
    pid: p.id,
    name: p.title,
    period: p.start_date ? `${dot(p.start_date)} ~ ${p.end_date ? dot(p.end_date) : ""}` : "",
  };
}

/** 많이 나온 태그 순서 (선택한 프로젝트 전체) */
export function topTags(projects: PortfolioSource[], max = 6): string[] {
  const count = new Map<string, number>();
  for (const p of projects) for (const t of p.tags) count.set(t, (count.get(t) ?? 0) + 1);
  return [...count].sort((a, b) => b[1] - a[1]).map(([t]) => t).slice(0, max);
}

// ───────── 프롬프트 (실제 AI 연결 시 보낼 지시문) ─────────

function field(p: PortfolioSource, path: string): string {
  if (path === "title") return p.title;
  if (path === "topic") return p.topic ?? "";
  if (path === "dates") return period(p);
  if (path === "tags") return p.tags.join(", ");
  if (path === "records[].text") return p.records.filter((r) => r.text).map((r) => `${r.title}: ${r.text}`).join(" / ");
  if (path.startsWith("overview.")) return p.overview[path.slice(9)] ?? "";
  return "";
}

export function buildPrompt(tpl: Template, sec: TemplateSection, projects: PortfolioSource[]): string {
  const lines = [
    `[서식] ${tpl.name}  (레퍼런스: ${tpl.ref})`,
    `[섹션] ${sec.label}${sec.limit ? ` · ${sec.limit}자 이내` : ""}`,
    `[지시] ${sec.prompt || "(직접 입력 항목 · 생성하지 않음)"}`,
    "[입력 자료]",
  ];
  for (const p of projects) {
    lines.push(`- 프로젝트: ${p.title}`);
    for (const f of sec.sourceFields) {
      const v = field(p, f);
      if (v) lines.push(`    · ${f}: ${v.length > 600 ? v.slice(0, 600) + "…" : v}`);
    }
  }
  return lines.join("\n");
}

export const promptsFor = (id: TemplateId, projects: PortfolioSource[]) =>
  Object.fromEntries(TEMPLATES[id].sections.map((s) => [s.key, buildPrompt(TEMPLATES[id], s, projects)]));
