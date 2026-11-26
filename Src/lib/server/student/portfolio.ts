import type { AltRow, ProfileDraft, ProjectDraft, TemplateId } from "@/lib/core/index.ts";
import type { Db } from "../auth";

/**
 * 포트폴리오 (portfolios 표). 학생 한 명이 지금은 한 줄만 쓴다 (가장 최근 것).
 *   template_id : 고른 서식
 *   project_ids : 담을 프로젝트 (순서 포함)
 *   content     : 학생이 쓴 프로젝트별 3섹션 {project_id: {problem, role, result}}
 *   profile     : 1쪽 프로필 · 마지막 쪽 자기소개
 *   alt         : 대체서식 {rows, head, oath, checklist}
 *   draft       : AI 초안 자리 (AI 미연결이라 비어 있음)
 */
export interface AltForm { rows: AltRow[]; head: { track: string; unit: string }; oath: boolean; checklist: boolean[] }

export interface Portfolio {
  id: string | null;
  template_id: TemplateId;
  project_ids: string[];
  content: Record<string, ProjectDraft>;
  profile: ProfileDraft | null;
  alt: AltForm;
  built_at: string | null;
  updated_at: string | null;
}

export const emptyAlt = (): AltForm => ({ rows: [], head: { track: "", unit: "" }, oath: false, checklist: [] });

export async function getPortfolio(db: Db): Promise<Portfolio> {
  const { data, error } = await db
    .from("portfolios")
    .select("id, template_id, project_ids, content, profile, alt, built_at, updated_at")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    return { id: null, template_id: "portfolio-project", project_ids: [], content: {}, profile: null, alt: emptyAlt(), built_at: null, updated_at: null };
  }
  const alt = { ...emptyAlt(), ...(data.alt ?? {}) };
  return {
    id: data.id,
    template_id: data.template_id,
    project_ids: data.project_ids ?? [],
    content: data.content ?? {},
    profile: data.profile && Object.keys(data.profile).length ? data.profile : null,
    alt,
    built_at: data.built_at,
    updated_at: data.updated_at,
  };
}

export type PortfolioPatch = Partial<Pick<Portfolio, "template_id" | "project_ids" | "content" | "profile" | "alt" | "built_at">>;

/** 처음이면 만들고, 있으면 고친다. 저장된 id 와 수정 시각을 돌려준다. */
export async function savePortfolio(db: Db, id: string | null, patch: PortfolioPatch): Promise<{ id: string; updated_at: string }> {
  if (id) {
    const { data, error } = await db.from("portfolios").update(patch).eq("id", id).select("id, updated_at").single();
    if (error) throw new Error(error.message);
    return data;
  }
  const { data, error } = await db
    .from("portfolios")
    .insert({ title: "내 포트폴리오", template_id: "portfolio-project", ...patch })
    .select("id, updated_at")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

/** 모든 프로젝트의 개요 6항목 (학생이 쓴 값 > AI 값). 포트폴리오에서 한 번에 읽는다. */
export async function listOverviews(db: Db): Promise<Record<string, Record<string, string>>> {
  const { data, error } = await db.from("experiences").select("project_id, fields, source").is("record_version_id", null);
  if (error) throw new Error(error.message);
  const out: Record<string, Record<string, string>> = {};
  const rank = (s: string) => (s === "student" ? 2 : s === "ai" ? 1 : 0);
  const sorted = [...(data as { project_id: string; fields: Record<string, { text?: string }>; source: string }[])].sort((a, b) => rank(a.source) - rank(b.source));
  for (const row of sorted) {
    const cur = (out[row.project_id] ??= {});
    for (const [k, v] of Object.entries(row.fields ?? {})) if (v?.text) cur[k] = v.text;
  }
  return out;
}
