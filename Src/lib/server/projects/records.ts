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
      project_id: input.project_id,
      kind: input.kind,
      title: input.title,
      recorded_at: input.recorded_at || undefined,
      url: input.url || null,
      is_result: input.is_result ?? false,
      answer_key: input.answer_key || null,
    })
    .select("id, no")
    .single();
  if (error) throw new Error(error.message);

  await addVersion(db, { ...record, project_id: input.project_id }, 1, input.text);
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
    .select("id, no, project_id, current_version, record_versions ( version, body_hash )")
    .eq("id", recordId)
    .single();
  if (error) throw new Error(error.message);

  const latest = record.record_versions.find((v) => v.version === record.current_version);
  if (latest?.body_hash === hash(text)) return null;

  // TODO: 학생·AI가 고친 태그를 문장 해시 기준으로 새 버전에 옮기기 (태그 수정 화면을 만들 때)
  const version = record.current_version + 1;
  await addVersion(db, record, version, text);
  return version;
}

/** 결과물 표시를 켜거나 끈다. 본문이 아니므로 버전을 만들지 않는다. */
export async function setResult(db: Db, recordId: string, isResult: boolean) {
  const { error } = await db.from("records").update({ is_result: isResult }).eq("id", recordId);
  if (error) throw new Error(error.message);
}

/** 기록을 지운다. 버전·태그도 함께 지워진다. */
export async function deleteRecord(db: Db, recordId: string) {
  const { error } = await db.from("records").delete().eq("id", recordId);
  if (error) throw new Error(error.message);
}

/** 새 버전을 만들고 문장과 규칙 태그를 저장한 뒤, 기록의 현재 버전을 올린다. */
async function addVersion(
  db: Db,
  record: { id: string; no: number; project_id: string },
  version: number,
  text: string,
) {
  const { dict, tagger } = await loadDictionary(db);
  const sentences = toSentences(text, record.no, version);
  const tags = tagger.tagSentences(sentences);

  const { data: row, error: versionError } = await db
    .from("record_versions")
    .insert({ record_id: record.id, version, body_hash: hash(text), raw_text: text, sentences })
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
