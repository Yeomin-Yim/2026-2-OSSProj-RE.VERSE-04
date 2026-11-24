// 일반 파일 업로드: 파일 1개 = 노트 1개. (거캠 회고록은 자동으로 나누는 별도 기능: lib/server/gcam-import/)
//   글자 PDF·DOCX → 글을 추출해 문장 분리·규칙 태깅까지 (AI 없음)
//   사진(JPG·PNG·WEBP) → 증빙으로 파일만 저장. 설명 생성(캡션)은 하지 않는다
// 브라우저가 Storage 에 직접 올린 뒤(prepareFile → PUT), 서버가 그 파일을 읽어 기록을 만든다(addFile).

import { extractText, getDocumentProxy } from "unpdf";
import mammoth from "mammoth";
import type { Db } from "../auth";
import { createRecord } from "./records";

const BUCKET = "records";
/** record_versions 의 제약과 같다 (쪽수 0007, 글자 수 0001) */
const MAX_PAGES = 50;
const MAX_CHARS = 20000;

const TYPES = {
  pdf: { mime: "application/pdf", kind: "document" },
  docx: { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", kind: "document" },
  jpg: { mime: "image/jpeg", kind: "photo" },
  jpeg: { mime: "image/jpeg", kind: "photo" },
  png: { mime: "image/png", kind: "photo" },
  webp: { mime: "image/webp", kind: "photo" },
} as const;
type Ext = keyof typeof TYPES;

/** 확장자로 종류를 정한다. 받지 않는 파일이면 오류 */
export function fileType(fileName: string) {
  const ext = fileName.split(".").pop()?.toLowerCase() as Ext;
  if (!(ext in TYPES)) throw new Error("PDF, DOCX, JPG, PNG, WEBP 파일만 올릴 수 있어요.");
  return { ext, ...TYPES[ext] };
}

/**
 * 기록 id 를 미리 정하고 업로드 주소를 준다. 경로: {owner}/{record}/1/file.{확장자}
 * (Storage 는 한글 파일 이름을 받지 않아서 원래 이름은 노트 제목으로 남긴다)
 */
export async function prepareFile(db: Db, userId: string, fileName: string) {
  const { ext, mime } = fileType(fileName);
  const recordId = crypto.randomUUID();
  const path = `${userId}/${recordId}/1/file.${ext}`;
  const { data, error } = await db.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error) throw new Error(error.message);
  return { recordId, mime, uploadUrl: data.signedUrl };
}

/**
 * 올라간 파일로 노트를 만든다. 돌려주는 note: 화면에 알릴 말 (예: 글자가 없는 PDF)
 * shortcut: 업로드만 하고 addFile 을 부르지 않은 파일은 Storage 에 남는다. 쌓이면 imports 처럼 정리 작업을 둔다.
 */
export async function addFile(db: Db, userId: string, input: { recordId: string; project_id: string; title: string; fileName: string }) {
  const { ext, mime, kind } = fileType(input.fileName);
  const path = `${userId}/${input.recordId}/1/file.${ext}`;
  const { data: blob, error } = await db.storage.from(BUCKET).download(path);
  if (error) throw new Error("올린 파일을 찾지 못했어요. 다시 올려 주세요.");

  const { text, pages, note } = await extract(new Uint8Array(await blob.arrayBuffer()), ext);
  await createRecord(db, {
    id: input.recordId,
    project_id: input.project_id,
    kind,
    title: input.title.trim() || input.fileName,
    text,
    file: { file_path: path, file_mime: mime, page_count: pages },
  });
  return { note };
}

/** 원본 파일을 1분 동안 열 수 있는 주소 (사진 보기·내려받기) */
export async function fileUrl(db: Db, recordId: string) {
  const { data: v, error } = await db
    .from("record_versions")
    .select("file_path")
    .eq("record_id", recordId)
    .not("file_path", "is", null)
    .order("version", { ascending: false })
    .limit(1)
    .single();
  if (error) throw new Error("파일이 없는 기록이에요.");
  const { data, error: urlError } = await db.storage.from(BUCKET).createSignedUrl(v.file_path!, 60);
  if (urlError) throw new Error(urlError.message);
  return data.signedUrl;
}

/** 파일 → 글. 사진은 글 없음 */
export async function extract(bytes: Uint8Array, ext: Ext): Promise<{ text: string; pages: number | null; note?: string }> {
  if (TYPES[ext].kind === "photo") return { text: "", pages: null };

  let text: string;
  let pages: number | null = null;
  if (ext === "pdf") {
    const pdf = await getDocumentProxy(bytes).catch(() => {
      throw new Error("PDF를 열 수 없어요. 파일이 손상되었는지 확인해 주세요.");
    });
    pages = pdf.numPages;
    if (pages > MAX_PAGES) throw new Error(`PDF는 ${MAX_PAGES}쪽까지 올릴 수 있어요 (이 파일은 ${pages}쪽). 거캠 회고록이면 "거캠 회고록 가져오기"를 써 주세요.`);
    text = (await extractText(pdf, { mergePages: false })).text.join("\n\n");
  } else {
    const docx = await mammoth.extractRawText({ buffer: Buffer.from(bytes) }).catch(() => {
      throw new Error("DOCX를 열 수 없어요. 파일이 손상되었는지 확인해 주세요.");
    });
    text = docx.value;
  }
  // PDF 글에 섞인 제어 문자(특히 NUL)는 DB(Postgres)가 받지 않는다
  // eslint-disable-next-line no-control-regex
  text = text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

  if (!text) return { text, pages, note: "글자가 없는 파일이라 파일만 저장했어요 (스캔한 PDF 등)" };
  if (text.length > MAX_CHARS) {
    return { text: text.slice(0, MAX_CHARS), pages, note: `글이 길어서 앞 ${MAX_CHARS.toLocaleString()}자만 분석했어요. 원본 파일은 그대로 저장돼요` };
  }
  return { text, pages };
}
