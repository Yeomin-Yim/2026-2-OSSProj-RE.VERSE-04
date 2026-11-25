import type { Db } from "../auth";

/** 연결 그래프 노트 (graph_notes + note_projects) */
export interface GraphNote {
  id: string;
  title: string;
  body: string;
  pos: { x: number; y: number } | null;
  project_ids: string[];
  created_at: string;
  updated_at: string;
}

export async function listGraphNotes(db: Db): Promise<GraphNote[]> {
  const { data, error } = await db
    .from("graph_notes")
    .select("id, title, body, pos, created_at, updated_at, note_projects ( project_id )")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map(({ note_projects, ...n }: { note_projects: { project_id: string }[] } & Omit<GraphNote, "project_ids">) => ({
    ...n,
    project_ids: note_projects.map((x) => x.project_id),
  }));
}

export async function createGraphNote(db: Db, title: string, projectIds: string[]): Promise<GraphNote> {
  if (!projectIds.length) throw new Error("연결할 프로젝트를 하나 이상 골라 주세요");
  const { data, error } = await db
    .from("graph_notes")
    .insert({ title: title.trim() || "새 노트", body: "" })
    .select("id, title, body, pos, created_at, updated_at")
    .single();
  if (error) throw new Error(error.message);
  const link = await db.from("note_projects").insert(projectIds.map((project_id) => ({ note_id: data.id, project_id })));
  if (link.error) {
    await db.from("graph_notes").delete().eq("id", data.id);
    throw new Error(link.error.message);
  }
  return { ...data, project_ids: projectIds };
}

export async function updateGraphNote(db: Db, id: string, patch: { title?: string; body?: string; pos?: { x: number; y: number } | null }) {
  const { data, error } = await db.from("graph_notes").update(patch).eq("id", id).select("updated_at").single();
  if (error) throw new Error(error.message);
  return data.updated_at as string;
}

/** 노트의 연결 프로젝트를 통째로 바꾼다 (1개 이상) */
export async function setNoteProjects(db: Db, id: string, projectIds: string[]) {
  if (!projectIds.length) throw new Error("노트는 프로젝트 1개 이상과 연결돼야 해요");
  const { data: cur, error } = await db.from("note_projects").select("project_id").eq("note_id", id);
  if (error) throw new Error(error.message);
  const before = new Set(cur.map((x: { project_id: string }) => x.project_id));
  const add = projectIds.filter((p) => !before.has(p));
  const remove = [...before].filter((p) => !projectIds.includes(p as string));
  if (add.length) {
    const r = await db.from("note_projects").insert(add.map((project_id) => ({ note_id: id, project_id })));
    if (r.error) throw new Error(r.error.message);
  }
  if (remove.length) {
    const r = await db.from("note_projects").delete().eq("note_id", id).in("project_id", remove);
    if (r.error) throw new Error(r.error.message);
  }
  await db.from("graph_notes").update({ updated_at: new Date().toISOString() }).eq("id", id);
}

export async function deleteGraphNote(db: Db, id: string) {
  const { error } = await db.from("graph_notes").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
