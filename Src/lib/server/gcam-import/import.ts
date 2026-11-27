// 거캠 회고록 가져오기: 업로드 → OCR(끊겨도 이어서) → 묶기 → 확정 저장.
// 진행 상태는 imports 표 한 행에 있다 (supabase/migrations/0006_imports.sql). 화면이 쓰는 형식은 README.md 참고.

import { hash, noteText, parseSessions, sourceKeys, type GcamUnit } from "@/lib/core/index.ts";
import type { Db } from "../auth";
import { createProject } from "../projects/projects";
import { createRecord, updateRecordText } from "../projects/records";
import { GENERAL_PROJECT, buildDraft, type Draft } from "./draft";
import { ocrPages, pageCount, type OcrUnit } from "./ocr";

const BUCKET = "records";
/** OCR 한 번에 보내는 쪽 수 (10쪽 ≈ 20초) */
const BATCH = 1; // 쪽마다 따로 보내 동시에 읽는다 (10쪽: 한 번에 18초 → 1쪽씩 4초, 판단기록 D22)
/** stepImport 한 번에 동시에 보내는 OCR 호출 수. 30쪽 ≈ 25초 */
const PARALLEL = 24;
/** 비용 상한 (120쪽 ≈ $0.45). 한 학기 회고록은 40~75쪽 */
const MAX_PAGES = 120;

export type ImportStatus = "reading" | "ready" | "saving" | "saved";

export interface ImportView {
  id: string;
  file_name: string;
  status: ImportStatus;
  page_count: number | null;
  pages_done: number;
  /** status 가 ready 이후일 때만 */
  draft: Draft | null;
  /** 노트 본문 미리보기용. noteText(units, note.unit_ids) */
  units: GcamUnit[];
}

const VIEW_COLUMNS = "id, file_name, status, page_count, pages_done, draft, units";

/** 가져오기 한 건을 만들고, 브라우저가 PDF를 직접 올릴 주소를 돌려준다 (서버 액션 본문 한도 1MB를 피한다). */
export async function startImport(db: Db, userId: string, fileName: string) {
  const id = crypto.randomUUID();
  const path = `${userId}/imports/${id}.pdf`;
  const { error } = await db.from("imports").insert({ id, file_name: fileName, file_path: path });
  if (error) throw new Error(error.message);
  const { data, error: urlError } = await db.storage.from(BUCKET).createSignedUploadUrl(path);
  if (urlError) throw new Error(urlError.message);
  return { id, uploadUrl: data.signedUrl };
}

export async function getImport(db: Db, id: string): Promise<ImportView> {
  const { data, error } = await db.from("imports").select(VIEW_COLUMNS).eq("id", id).single();
  if (error) throw new Error(error.message);
  return data as ImportView;
}

/**
 * 다음 단계를 한 번 진행한다. 화면은 status 가 ready 가 될 때까지 반복해 부른다.
 *   reading: 아직 안 읽은 쪽을 최대 BATCH×PARALLEL 쪽 OCR → units 에 덧붙임
 *   다 읽었으면: U번호를 붙이고 묶기(약 40~50초) → draft 저장, status = ready
 * 도중에 실패해도 저장된 쪽은 남아 있어서, 다시 부르면 이어서 한다.
 */
export async function stepImport(db: Db, id: string): Promise<ImportView> {
  const { data: row, error } = await db
    .from("imports")
    .select("file_path, status, page_count, pages_done, units, usage")
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);
  if (row.status !== "reading") return getImport(db, id);

  const pdf = await download(db, row.file_path);
  const total: number = row.page_count ?? (await pageCount(pdf));
  if (total > MAX_PAGES) throw new Error(`${MAX_PAGES}쪽까지 가져올 수 있어요. (이 파일은 ${total}쪽)`);

  if (row.pages_done < total) {
    const ranges = Array.from({ length: PARALLEL }, (_, i) => row.pages_done + i * BATCH + 1)
      .filter((from) => from <= total)
      .map((from) => [from, Math.min(total, from + BATCH - 1)] as const);
    const results = await Promise.all(ranges.map(([a, b]) => ocrPages(pdf, a, b)));
    const done = ranges.at(-1)![1];
    // pages_done 이 그대로일 때만 덧붙인다: 같은 단계가 두 번 동시에 불려도 쪽이 겹치지 않는다
    const { error: saveError } = await db
      .from("imports")
      .update({
        page_count: total,
        pages_done: done,
        units: [...row.units, ...results.flatMap((r) => r.units)],
        usage: [...row.usage, ...results.map((r) => r.usage)],
      })
      .eq("id", id)
      .eq("pages_done", row.pages_done);
    if (saveError) throw new Error(saveError.message);
    return getImport(db, id);
  }

  // 다 읽음 → 묶기
  const units: GcamUnit[] = (row.units as OcrUnit[])
    .toSorted((a, b) => a.page - b.page) // 같은 쪽 안의 순서는 유지된다 (stable sort)
    .map((u, i) => ({ id: `U${String(i + 1).padStart(4, "0")}`, ...u }));
  const { draft, usage } = await buildDraft(units, await existingProjects(db));
  const { error: saveError } = await db
    .from("imports")
    .update({ status: "ready", units, draft, usage: [...row.usage, ...usage] })
    .eq("id", id)
    .eq("status", "reading");
  if (saveError) throw new Error(saveError.message);
  return getImport(db, id);
}

/**
 * 학생이 고친 초안을 저장한다. 두 번 눌러도, 도중에 실패해 다시 눌러도, 새 PDF로 다시 가져와도 중복이 생기지 않는다.
 *   - 프로젝트: existing_project_id → 같은 제목의 내 프로젝트 → 새로 만들기
 *   - 미분류로 남은 노트: '일반 활동' 프로젝트로
 *   - 노트: 같은 칸(source_key)의 기록이 없으면 새로 만든다. 있으면 거캠 본문이 바뀐 경우에만 새 버전.
 *     학생이 앱에서 고친 노트(지금 본문 ≠ 가져오기가 쓴 본문)는 건드리지 않는다.
 *     이미 있는 기록은 프로젝트를 옮기지 않는다 (학생이 옮겨 둔 것을 되돌리지 않기 위해)
 * 노트 본문은 서버에 저장된 OCR 원문으로 만든다. 화면이 보낸 것은 제목·날짜·묶음(unit_ids)뿐이다.
 */
export async function confirmImport(db: Db, id: string, draft: Draft) {
  // 잠금: ready → saving. 저장 중 서버가 죽어 saving 에 멈췄으면 5분 뒤 다시 허용
  const stale = new Date(Date.now() - 5 * 60_000).toISOString();
  const { data: row, error } = await db
    .from("imports")
    .update({ status: "saving" })
    .eq("id", id)
    .or(`status.eq.ready,and(status.eq.saving,updated_at.lt.${stale})`)
    .select("units")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) throw new Error("이미 저장했거나 저장 중이에요.");

  try {
    const units = row.units as GcamUnit[];
    const known = new Set(units.map((u) => u.id));
    const used = new Set<string>();
    for (const n of [...draft.projects.flatMap((p) => p.notes), ...draft.unassigned]) {
      if (!n.unit_ids.length || !n.title.trim()) throw new Error("제목이나 내용이 빈 노트가 있어요.");
      for (const u of n.unit_ids) {
        if (!known.has(u) || used.has(u)) throw new Error("초안이 올바르지 않아요. 새로고침 후 다시 시도해 주세요.");
        used.add(u);
      }
    }

    const targets = [
      ...draft.projects.flatMap((p) => p.notes.map((n) => ({ ...n, project: { id: p.existing_project_id, title: p.title } }))),
      ...draft.unassigned.map((n) => ({ ...n, project: { id: draft.general_project_id, title: GENERAL_PROJECT } })),
    ];
    const keys = sourceKeys(parseSessions(units).sessions, targets.map((t) => t.unit_ids));
    const { data: saved, error: keyError } = await db
      .from("records")
      .select("id, source_key, source_hash, current_version, record_versions ( version, body_hash )")
      .in("source_key", keys.filter((k) => k !== null));
    if (keyError) throw new Error(keyError.message);
    const byKey = new Map(saved.map((r) => [r.source_key, r]));

    // 프로젝트는 새로 만들 노트가 있을 때만 찾거나 만든다 (다시 가져오기에서 빈 프로젝트가 생기지 않게)
    const { data: mine, error: listError } = await db.from("projects").select("id, title");
    if (listError) throw new Error(listError.message);
    // 새로 만드는 프로젝트의 기간 = 그 프로젝트에 들어가는 노트의 첫 날짜 ~ 마지막 날짜 (목록 정렬·기간 표시용, 판단기록 D24)
    const span = new Map<string, { from: string; to: string }>();
    for (const t of targets) {
      if (!t.date) continue;
      const k = t.project.id ?? t.project.title.trim();
      const cur = span.get(k);
      span.set(k, { from: !cur || t.date < cur.from ? t.date : cur.from, to: !cur || t.date > cur.to ? t.date : cur.to });
    }
    // 마지막 노트가 한 달 넘게 지난 프로젝트는 '완료'로 만든다 (지난 학기 회고록을 올린 경우)
    const done = (to?: string) => !!to && Date.now() - Date.parse(to) > 30 * 86_400_000;
    const resolve = async ({ id: existingId, title }: { id: string | null; title: string }) => {
      const found = mine.find((p) => p.id === existingId) ?? mine.find((p) => p.title.trim() === title.trim());
      if (found) return found.id;
      const when = span.get(existingId ?? title.trim());
      const created = { id: await createProject(db, { title: title.trim(), topic: "", start_date: when?.from ?? null, end_date: when?.to ?? null, status: done(when?.to) ? "done" : "active" }), title };
      mine.push(created);
      return created.id;
    };

    const count = { created: 0, updated: 0, unchanged: 0, kept: 0 };
    for (const [i, t] of targets.entries()) {
      const text = noteText(units, t.unit_ids);
      const existing = keys[i] ? byKey.get(keys[i]) : undefined;
      if (existing) {
        const current = existing.record_versions.find((v) => v.version === existing.current_version)?.body_hash;
        if (current !== existing.source_hash) count.kept++; // 학생이 앱에서 고친 노트: 건드리지 않는다
        else if (hash(text) === existing.source_hash) count.unchanged++;
        else {
          await updateRecordText(db, existing.id, text);
          const { error: hashError } = await db.from("records").update({ source_hash: hash(text) }).eq("id", existing.id);
          if (hashError) throw new Error(hashError.message);
          count.updated++;
        }
      } else {
        await createRecord(db, {
          project_id: await resolve(t.project),
          kind: "reflection",
          title: t.title.trim(),
          text,
          recorded_at: t.date ?? undefined,
          source_key: keys[i] ?? undefined,
        });
        count.created++;
      }
    }

    const { error: doneError } = await db.from("imports").update({ status: "saved", draft }).eq("id", id);
    if (doneError) throw new Error(doneError.message);
    return count;
  } catch (e) {
    await db.from("imports").update({ status: "ready" }).eq("id", id);
    throw e;
  }
}

/** 묶기 AI 에게 줄 내 프로젝트: 제목·주제·최근 노트 제목 5개 (학기 간 이어 붙이기 판단용) */
async function existingProjects(db: Db) {
  const { data, error } = await db
    .from("projects")
    .select("id, title, topic, records ( title, recorded_at )")
    .order("recorded_at", { referencedTable: "records", ascending: false })
    .limit(5, { referencedTable: "records" });
  if (error) throw new Error(error.message);
  return data.map((p) => ({
    id: p.id,
    title: p.title,
    ...(p.topic ? { topic: p.topic } : {}),
    ...(p.records.length ? { recent_notes: p.records.map((r) => r.title) } : {}),
  }));
}

async function download(db: Db, path: string) {
  const { data, error } = await db.storage.from(BUCKET).download(path);
  if (error) throw new Error("PDF를 찾지 못했어요. 다시 올려 주세요.");
  return new Uint8Array(await data.arrayBuffer());
}
