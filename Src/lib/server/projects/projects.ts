import { cache } from "react";
import { groupByCode, mergeTags, type ProjectTags, type Sentence, type Source, type Tag } from "@/lib/core/index.ts";
import type { Db } from "../auth";

export interface ProjectRow {
  id: string;
  title: string;
  topic: string | null;
  start_date: string | null;
  end_date: string | null;
  status: "active" | "done";
  record_count: number;
}

export interface ProjectInput {
  title: string;
  topic: string;
  start_date: string | null;
  end_date: string | null;
  status: "active" | "done";
}

/** 기록 한 건 + 최신 버전의 문장과 병합된 태그 */
export interface RecordView {
  id: string;
  no: number;
  project_id: string;
  kind: string;
  title: string;
  recorded_at: string;
  is_result: boolean;
  url: string | null;
  answer_key: string | null;
  version: number;
  version_id: string | null;
  raw_text: string;
  has_file: boolean;
  sentences: Sentence[];
  tags: Tag[];
}

/** 개요 6항목. 값은 { text, sids } */
export const OVERVIEW_KEYS = ["role", "activity", "problem", "process", "result", "reflection"] as const;
export type OverviewKey = (typeof OVERVIEW_KEYS)[number];
export type Overview = Record<OverviewKey, string>;

const PROJECT_COLUMNS = "id, title, topic, start_date, end_date, status, records(count)";

type RawProject = Omit<ProjectRow, "record_count"> & { records: { count: number }[] };
const toProjectRow = ({ records, ...p }: RawProject): ProjectRow => ({ ...p, record_count: records[0]?.count ?? 0 });

// ───────── 프로젝트 ─────────

/** 내 프로젝트 목록. 한 요청 안에서 레이아웃과 페이지가 같이 써도 DB는 한 번만 읽는다. */
export const listProjects = cache(async (db: Db): Promise<ProjectRow[]> => {
  const { data, error } = await db.from("projects").select(PROJECT_COLUMNS).order("start_date", { ascending: true });
  if (error) throw new Error(error.message);
  return (data as unknown as RawProject[]).map(toProjectRow);
});

export async function createProject(db: Db, input: ProjectInput): Promise<string> {
  const { data, error } = await db.from("projects").insert(withProjectInput(input)).select("id").single();
  if (error) throw new Error(error.message);
  return data.id;
}

/** 제목·기간·상태만 바꾼다. 기록 버전은 만들지 않는다 (발표 p34). */
export async function updateProject(db: Db, id: string, input: ProjectInput) {
  const { error } = await db.from("projects").update(withProjectInput(input)).eq("id", id);
  if (error) throw new Error(error.message);
}

/** 하위 기록·버전·태그도 함께 지워진다 (DB의 on delete cascade). */
export async function deleteProject(db: Db, id: string) {
  const { error } = await db.from("projects").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

const withProjectInput = (input: ProjectInput) => ({
  ...input,
  topic: input.topic || null,
});

// ───────── 기록 ─────────

/**
 * 기록 목록을 최신 버전 기준으로 읽는다. projectId 를 주지 않으면 내 기록 전체.
 * 태그는 출처별(rule · ai · student)로 저장된 것을 병합한 결과다.
 */
export async function listRecords(db: Db, projectId?: string): Promise<RecordView[]> {
  let query = db
    .from("records")
    .select(
      `id, no, project_id, kind, title, recorded_at, is_result, url, answer_key, current_version,
       record_versions ( id, version, raw_text, file_path, sentences, experiences ( tags, source ) )`,
    )
    .order("recorded_at", { ascending: false })
    .order("no", { ascending: false });
  if (projectId) query = query.eq("project_id", projectId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return data.map((r) => {
    const latest = r.record_versions.find((v) => v.version === r.current_version);
    const bySource: Partial<Record<Source, Tag[]>> = {};
    for (const e of latest?.experiences ?? []) bySource[e.source as Source] = e.tags as Tag[];

    return {
      id: r.id,
      no: r.no,
      project_id: r.project_id,
      kind: r.kind,
      title: r.title,
      recorded_at: r.recorded_at,
      is_result: r.is_result,
      url: r.url,
      answer_key: r.answer_key,
      version: r.current_version,
      version_id: latest?.id ?? null,
      raw_text: latest?.raw_text ?? "",
      has_file: !!latest?.file_path,
      sentences: (latest?.sentences ?? []) as Sentence[],
      tags: mergeTags(bySource),
    };
  });
}

/** 프로젝트 태그 = 그 프로젝트 모든 기록의 최신 버전 태그를 합친 것 */
export function toProjectTags(records: RecordView[]): ProjectTags[] {
  const byProject = new Map<string, Tag[]>();
  for (const r of records) {
    byProject.set(r.project_id, [...(byProject.get(r.project_id) ?? []), ...r.tags]);
  }
  return [...byProject].map(([id, tags]) => ({ id, tags: groupByCode(tags) }));
}

// ───────── 개요 ─────────

/** 프로젝트 개요 6항목. 학생이 쓴 값이 AI 값보다 우선한다. */
export async function getOverview(db: Db, projectId: string): Promise<Overview> {
  const { data, error } = await db
    .from("experiences")
    .select("fields, source")
    .eq("project_id", projectId)
    .is("record_version_id", null);
  if (error) throw new Error(error.message);

  const fieldsOf = (source: Source) =>
    (data.find((row) => row.source === source)?.fields ?? {}) as Partial<Record<OverviewKey, { text: string }>>;
  const student = fieldsOf("student");
  const ai = fieldsOf("ai");

  return Object.fromEntries(
    OVERVIEW_KEYS.map((key) => [key, student[key]?.text || ai[key]?.text || ""]),
  ) as Overview;
}

/** 학생이 고친 개요를 저장한다 (source=student). */
export async function saveOverview(db: Db, projectId: string, overview: Overview) {
  const fields = Object.fromEntries(OVERVIEW_KEYS.map((key) => [key, { text: overview[key], sids: [] }]));

  const { data: existing, error } = await db
    .from("experiences")
    .select("id")
    .eq("project_id", projectId)
    .is("record_version_id", null)
    .eq("source", "student")
    .maybeSingle();
  if (error) throw new Error(error.message);

  const result = existing
    ? await db.from("experiences").update({ fields }).eq("id", existing.id)
    : await db.from("experiences").insert({ project_id: projectId, fields, source: "student" });
  if (result.error) throw new Error(result.error.message);
}
