"use server";

// 연결 그래프 · 스크랩 · 체크리스트에서 부르는 서버 액션.
// 모두 { ok, message, data? } 를 돌려준다. 저장에 실패하면 ok:false 와 이유를 돌려주고, 화면은 저장됐다고 표시하지 않는다.

import { revalidatePath } from "next/cache";
import { requireUser, type Db } from "@/lib/server/auth";
import * as notes from "@/lib/server/student/notes";
import * as scraps from "@/lib/server/student/scraps";
import * as todos from "@/lib/server/student/todos";

export type Result<T = undefined> = { ok: boolean; message: string; data?: T };

async function run<T>(work: (db: Db) => Promise<{ message?: string; data?: T }>, revalidate = false): Promise<Result<T>> {
  const { supabase } = await requireUser();
  try {
    const r = await work(supabase);
    if (revalidate) revalidatePath("/", "layout");
    return { ok: true, message: r.message ?? "", data: r.data };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "저장하지 못했어요." };
  }
}

// ───────── 그래프 노트 ─────────

export async function createNote(title: string, projectIds: string[]) {
  return run(async (db) => ({ data: await notes.createGraphNote(db, title, projectIds), message: "노트를 추가했어요 · 아래에 내용을 적어보세요" }), true);
}
export async function updateNote(id: string, patch: { title?: string; body?: string }) {
  return run(async (db) => ({ data: await notes.updateGraphNote(db, id, patch) }));
}
export async function moveNote(id: string, pos: { x: number; y: number } | null) {
  return run(async (db) => ({ data: await notes.updateGraphNote(db, id, { pos }) }));
}
export async function linkNote(id: string, projectIds: string[]) {
  return run(async (db) => {
    await notes.setNoteProjects(db, id, projectIds);
    return { message: "연결 프로젝트를 바꿨어요" };
  }, true);
}
export async function deleteNote(id: string) {
  return run(async (db) => {
    await notes.deleteGraphNote(db, id);
    return { message: "노트를 삭제했어요" };
  }, true);
}

// ───────── 스크랩 ─────────

export async function toggleScrap(input: scraps.ScrapInput) {
  return run(async (db) => {
    const r = await scraps.toggleScrap(db, input);
    return { data: r, message: r.on ? "스크랩에 담았어요" : "스크랩을 해제했어요" };
  });
}
export async function saveScrapMemo(id: string, memo: string) {
  return run(async (db) => {
    await scraps.updateScrapMemo(db, id, memo);
    return {};
  });
}
export async function removeScrap(id: string) {
  return run(async (db) => {
    await scraps.removeScrap(db, id);
    return { message: "스크랩을 해제했어요" };
  });
}

// ───────── 체크리스트 ─────────

export async function changeTodo(key: string, defaults: string[], change: todos.TodoOp) {
  return run(async (db) => ({ data: await todos.applyTodo(db, key, defaults, change) }));
}

// ───────── 그래프 탐색 위치 (profiles.ui_state.career) ─────────

export async function saveExplorePlace(place: { mode: string | null; path: string[]; sel: string | null }) {
  const { supabase, userId } = await requireUser();
  const { data } = await supabase.from("profiles").select("ui_state").eq("id", userId).maybeSingle();
  const ui_state = { ...(data?.ui_state ?? {}), career: place };
  const { error } = await supabase.from("profiles").update({ ui_state }).eq("id", userId);
  return { ok: !error, message: error?.message ?? "" };
}
