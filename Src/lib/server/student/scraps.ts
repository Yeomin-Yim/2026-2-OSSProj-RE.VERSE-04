import type { Db } from "../auth";

/** DB scraps.type 에 허용된 값 (0001_schema.sql check). 채용공고는 아직 데이터·타입이 없다. */
export type ScrapType = "major" | "job" | "university" | "note" | "project";
export const SCRAP_TYPES: ScrapType[] = ["major", "job", "university", "note", "project"];

/** 스크랩한 곳: 그래프 탐색 위치 (원래 위치로 돌아갈 때 쓴다) */
export interface ScrapLoc { mode: "college" | "career" | null; path: string[]; sel: string | null; note?: string; project?: string }

export interface Scrap {
  id: string;
  type: ScrapType;
  ref_id: string;
  title: string;
  meta: { sub?: string; note?: string };
  memo: string;
  loc: ScrapLoc | null;
  created_at: string;
}

const COLUMNS = "id, type, ref_id, title, meta, memo, loc, created_at";

export async function listScraps(db: Db): Promise<Scrap[]> {
  const { data, error } = await db.from("scraps").select(COLUMNS).order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data as Scrap[];
}

export interface ScrapInput { type: ScrapType; ref_id: string; title: string; meta?: Scrap["meta"]; loc?: ScrapLoc | null; memo?: string }

/** 있으면 지우고(false), 없으면 만든다(true + 새 행) */
export async function toggleScrap(db: Db, input: ScrapInput): Promise<{ on: boolean; scrap: Scrap | null }> {
  if (!SCRAP_TYPES.includes(input.type)) throw new Error("스크랩할 수 없는 종류예요");
  const { data: found, error } = await db.from("scraps").select("id").eq("type", input.type).eq("ref_id", input.ref_id).maybeSingle();
  if (error) throw new Error(error.message);
  if (found) {
    await removeScrap(db, found.id);
    return { on: false, scrap: null };
  }
  return { on: true, scrap: await addScrap(db, input) };
}

export async function addScrap(db: Db, input: ScrapInput): Promise<Scrap> {
  const { data, error } = await db
    .from("scraps")
    .upsert(
      { type: input.type, ref_id: input.ref_id, title: input.title, meta: input.meta ?? {}, loc: input.loc ?? null, memo: input.memo ?? "" },
      { onConflict: "owner_id,type,ref_id" },
    )
    .select(COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  return data as Scrap;
}

export async function updateScrapMemo(db: Db, id: string, memo: string) {
  const { error } = await db.from("scraps").update({ memo: memo.slice(0, 2000) }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function removeScrap(db: Db, id: string) {
  const { error } = await db.from("scraps").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
