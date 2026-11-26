import type { Db } from "../auth";

/** 해야 할 일 체크리스트. key = 'university:{id}' | 'job:{id}' | 'major:{id}' | 'project:{id}' */
export interface Todo { id: string; key: string; text: string; done: boolean; created_at: string }

export async function listTodos(db: Db): Promise<Todo[]> {
  const { data, error } = await db.from("todos").select("id, key, text, done, created_at").order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data as Todo[];
}

async function listKey(db: Db, key: string): Promise<Todo[]> {
  const { data, error } = await db.from("todos").select("id, key, text, done, created_at").eq("key", key).order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data as Todo[];
}

export type TodoOp = { op: "add"; text: string } | { op: "toggle"; id: string } | { op: "remove"; id: string };

/**
 * 체크리스트 한 개를 바꾸고 그 목록을 돌려준다.
 * 아직 한 줄도 없는 목록이면 화면에 보이던 기본 항목(defaults)을 먼저 저장한 뒤 바꾼다.
 * 기본 항목의 id 는 화면에서 'default:{번호}' 로 온다.
 */
export async function applyTodo(db: Db, key: string, defaults: string[], change: TodoOp): Promise<Todo[]> {
  let list = await listKey(db, key);
  let target = "id" in change ? change.id : "";
  if (!list.length && defaults.length) {
    const ins = await db.from("todos").insert(defaults.map((text) => ({ key, text: text.slice(0, 80) }))).select("id, key, text, done, created_at");
    if (ins.error) throw new Error(ins.error.message);
    list = (ins.data as Todo[]).sort((a, b) => defaults.indexOf(a.text) - defaults.indexOf(b.text));
    if (target.startsWith("default:")) target = list[Number(target.slice(8))]?.id ?? "";
  }
  if (change.op === "add") {
    const text = change.text.trim().slice(0, 80);
    if (!text) return list;
    const r = await db.from("todos").insert({ key, text });
    if (r.error) throw new Error(r.error.message);
  } else if (change.op === "toggle") {
    const item = list.find((t) => t.id === target);
    if (!item) throw new Error("할 일을 찾지 못했어요");
    const r = await db.from("todos").update({ done: !item.done }).eq("id", item.id);
    if (r.error) throw new Error(r.error.message);
  } else {
    const r = await db.from("todos").delete().eq("id", target);
    if (r.error) throw new Error(r.error.message);
  }
  return listKey(db, key);
}
