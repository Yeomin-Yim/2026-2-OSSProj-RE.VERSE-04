import { hash, toSentences } from "@/lib/core/index.ts";
import type { Db } from "../auth";
import { loadDictionary } from "../dictionary";

const MAX_CHARS = 20000;

export interface NewRecord {
  project_id: string;
  kind: string;
  title: string;
  text: string;
  recorded_at?: string;
  url?: string;
  is_result?: boolean;
  answer_key?: string;
  /** 거캠 회고록의 어느 칸에서 왔는지. 같은 학생 안에서 겹치지 않는다 (lib/server/gcam-import/save.ts) */
  source_key?: string;
  /** 미리 정한 기록 id (파일을 먼저 올린 경우. Storage 경로에 id 가 들어간다) */
  id?: string;
  /** 첨부 파일. 이때 text 는 파일에서 추출한 글이라 extracted_text 에 저장한다 (lib/server/projects/files.ts) */
  file?: VersionFile;
}

/** 버전에 붙은 파일. 본문을 고쳐 새 버전을 만들어도 그대로 따라간다 */
interface VersionFile {
  file_path: string;
  file_mime: string;
  page_count: number | null;
}

/**
 * 기록 저장 (발표 p12 '저장은 코드가 즉시')
 *   ① 기록 생성 → ② 버전 1 + 문장 분리 → ③ 규칙 태깅
 * 연결선 재계산(recomputeGraph)은 응답을 보낸 뒤에 돌도록 actions.ts 에서 부른다.
 */
export async function createRecord(db: Db, input: NewRecord): Promise<string> {
  assertLength(input.text);

  const { data: record, error } = await db
    .from("records")
    .insert({
      id: input.id,
      project_id: input.project_id,
      kind: input.kind,
      title: input.title,
      recorded_at: input.recorded_at || undefined,
      url: input.url || null,
      is_result: input.is_result ?? false,
      answer_key: input.answer_key || null,
      source_key: input.source_key || null,
      source_hash: input.source_key ? hash(input.text) : null,
    })
    .select("id, no")
    .single();
  if (error) throw new Error(error.message);

  try {
    await addVersion(db, { ...record, project_id: input.project_id }, 1, input.text, input.file && { ...input.file, extracted: true });
  } catch (e) {
    // 버전 없는 빈 기록이 남지 않게 지운다 (파일은 남겨 둔다: 다시 시도할 때 같은 경로를 쓴다)
    await db.from("records").delete().eq("id", record.id);
    throw e;
  }
  return record.id;
}

/**
 * 기록 본문 수정. 본문이 실제로 바뀌었을 때만 새 버전을 만든다 (발표 p34).
 * 돌려주는 값: 새로 만든 버전 번호. 바뀐 내용이 없으면 null
 */
export async function updateRecordText(db: Db, recordId: string, text: string): Promise<number | null> {
  assertLength(text);

  const { data: record, error } = await db
    .from("records")
    .select("id, no, project_id, current_version, record_versions ( version, body_hash, file_path, file_mime, page_count )")
    .eq("id", recordId)
    .single();
  if (error) throw new Error(error.message);

  const latest = record.record_versions.find((v) => v.version === record.current_version);
  if (latest?.body_hash === hash(text)) return null;

  // TODO: 학생·AI가 고친 태그를 문장 해시 기준으로 새 버전에 옮기기 (태그 수정 화면을 만들 때)
  const version = record.current_version + 1;
  // 파일 기록이면 고친 본문은 raw_text 에, 파일은 새 버전에도 그대로 붙인다
  const file = latest?.file_path ? { file_path: latest.file_path, file_mime: latest.file_mime!, page_count: latest.page_count, extracted: false } : undefined;
  await addVersion(db, record, version, text, file);
  return version;
}

/** 결과물 표시를 켜거나 끈다. 본문이 아니므로 버전을 만들지 않는다. */
export async function setResult(db: Db, recordId: string, isResult: boolean) {
  const { error } = await db.from("records").update({ is_result: isResult }).eq("id", recordId);
  if (error) throw new Error(error.message);
}

/** 기록을 다른 프로젝트로 옮긴다. 기록의 태그 행도 프로젝트를 따라간다. 버전은 만들지 않는다. */
export async function moveRecord(db: Db, recordId: string, projectId: string) {
  // records 를 먼저: 남의 프로젝트로 옮기려 하면 RLS(parent_own_upd)가 여기서 막는다
  const { data, error } = await db
    .from("records")
    .update({ project_id: projectId })
    .eq("id", recordId)
    .select("record_versions ( id )")
    .single();
  if (error) throw new Error(error.message);
  const { error: tagError } = await db
    .from("experiences")
    .update({ project_id: projectId })
    .in("record_version_id", data.record_versions.map((v) => v.id));
  if (tagError) throw new Error(tagError.message);
}

/** 기록을 지운다. 버전·태그도 함께 지워진다. */
export async function deleteRecord(db: Db, recordId: string) {
  const { data: versions } = await db.from("record_versions").select("file_path").eq("record_id", recordId);
  const { error } = await db.from("records").delete().eq("id", recordId);
  if (error) throw new Error(error.message);
  const paths = [...new Set((versions ?? []).map((v) => v.file_path).filter((p) => p !== null))];
  // 기록은 이미 지워졌으니 파일 삭제 실패는 저장 실패로 돌려주지 않는다
  if (paths.length) await db.storage.from("records").remove(paths).catch((e) => console.error("파일 삭제 실패:", e));
}

/** 새 버전을 만들고 문장과 규칙 태그를 저장한 뒤, 기록의 현재 버전을 올린다. */
async function addVersion(
  db: Db,
  record: { id: string; no: number; project_id: string },
  version: number,
  text: string,
  file?: VersionFile & { extracted: boolean },
) {
  const { dict, tagger } = await loadDictionary(db);
  const sentences = toSentences(text, record.no, version);
  const tags = tagger.tagSentences(sentences);

  const { data: row, error: versionError } = await db
    .from("record_versions")
    .insert({
      record_id: record.id,
      version,
      body_hash: hash(text),
      sentences,
      ...(file?.extracted ? { extracted_text: text } : { raw_text: text }),
      ...(file && { file_path: file.file_path, file_mime: file.file_mime, page_count: file.page_count }),
    })
    .select("id")
    .single();
  if (versionError) throw new Error(versionError.message);

  // 태그 저장과 현재 버전 갱신은 서로 기다릴 필요가 없다
  const [tagResult, updateResult] = await Promise.all([
    db.from("experiences").insert({
      project_id: record.project_id,
      record_version_id: row.id,
      tags,
      source: "rule",
      rule_version: dict.version,
    }),
    db.from("records").update({ current_version: version }).eq("id", record.id),
  ]);
  if (tagResult.error) throw new Error(tagResult.error.message);
  if (updateResult.error) throw new Error(updateResult.error.message);
}

function assertLength(text: string) {
  if (text.length > MAX_CHARS) throw new Error(`기록은 ${MAX_CHARS.toLocaleString()}자까지 저장할 수 있어요.`);
}
