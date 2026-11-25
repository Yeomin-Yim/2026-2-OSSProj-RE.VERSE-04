"use client";

// 파일 올리기 (파일 1개 = 노트 1개). 서버 순서는 lib/server/projects/README.md 그대로:
//   ① prepareFile(파일 이름) → 업로드 주소   ② 브라우저가 Storage 에 직접 PUT   ③ addFile → 글 추출·태깅·노트 생성
// 여러 파일을 고르면 하나씩 차례로 올린다 (동시에 보내지 않아 순서·실패 표시가 분명하다).

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { addFile, prepareFile } from "@/app/(app)/projects/actions";
import { Icon } from "@/components/ui/Icon";

/**
 * 서버(lib/server/projects/files.ts 의 TYPES)가 받는 형식과 같게 맞춘 목록. 화면에서 먼저 걸러 줄 뿐,
 * 최종 판단은 서버(prepareFile)가 한다.
 */
const ACCEPT: Record<string, "document" | "photo"> = {
  pdf: "document", docx: "document", jpg: "photo", jpeg: "photo", png: "photo", webp: "photo",
};
const ACCEPT_ATTR =
  ".pdf,.docx,.jpg,.jpeg,.png,.webp,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/jpeg,image/png,image/webp";
/** Storage 업로드 한도 (README: 파일 30MB) */
const MAX_BYTES = 30 * 1024 * 1024;

type Status = "ready" | "uploading" | "saving" | "done" | "error";
interface Item {
  key: string;
  file: File;
  title: string;
  kind: "document" | "photo";
  status: Status;
  message?: string;
}

const extOf = (name: string) => name.split(".").pop()?.toLowerCase() ?? "";
const sizeText = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))}KB` : `${(b / 1024 / 1024).toFixed(1)}MB`);

const STATUS_TEXT: Record<Status, string> = {
  ready: "올릴 준비됨",
  uploading: "올리는 중…",
  saving: "저장하는 중…",
  done: "저장됨",
  error: "실패",
};

export function FileUploadPanel({ projectId, onClose, onBusyChange }: { projectId: string; onClose: () => void; onBusyChange: (busy: boolean) => void }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [rejected, setRejected] = useState<string[]>([]);
  const [busy, setBusyState] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [ran, setRan] = useState(false);
  const running = useRef(false); // 연속 클릭으로 두 번 시작하지 않도록 (state 보다 먼저 막는다)

  const setBusy = (b: boolean) => { setBusyState(b); onBusyChange(b); };
  const patch = (key: string, change: Partial<Item>) =>
    setItems((list) => list.map((it) => (it.key === key ? { ...it, ...change } : it)));

  function addFiles(files: FileList | File[]) {
    const bad: string[] = [];
    const next: Item[] = [];
    for (const file of Array.from(files)) {
      const kind = ACCEPT[extOf(file.name)];
      if (!kind) { bad.push(`${file.name} — PDF, DOCX, JPG, PNG, WEBP만 올릴 수 있어요`); continue; }
      if (file.size > MAX_BYTES) { bad.push(`${file.name} — 30MB보다 커요 (${sizeText(file.size)})`); continue; }
      if (file.size === 0) { bad.push(`${file.name} — 빈 파일이에요`); continue; }
      next.push({
        key: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 7)}`,
        file,
        title: file.name.replace(/\.[^.]+$/, ""),
        kind,
        status: "ready",
      });
    }
    setRejected(bad);
    if (next.length) setItems((list) => [...list, ...next]);
  }

  async function uploadOne(it: Item) {
    patch(it.key, { status: "uploading", message: undefined });
    try {
      const p = await prepareFile(it.file.name);
      if (!p.ok) return patch(it.key, { status: "error", message: p.message });

      const put = await fetch(p.uploadUrl, { method: "PUT", body: it.file, headers: { "content-type": p.mime } });
      if (!put.ok) return patch(it.key, { status: "error", message: `파일을 올리지 못했어요 (${put.status}). 잠시 후 다시 시도해 주세요.` });

      patch(it.key, { status: "saving" });
      const r = await addFile({ recordId: p.recordId, project_id: projectId, title: it.title.trim() || it.file.name, fileName: it.file.name });
      patch(it.key, r.ok ? { status: "done", message: r.message } : { status: "error", message: r.message });
    } catch {
      patch(it.key, { status: "error", message: "연결이 끊겼어요. 다시 시도해 주세요." });
    }
  }

  async function start() {
    if (running.current) return;
    const todo = items.filter((it) => it.status === "ready" || it.status === "error");
    if (!todo.length) return;
    running.current = true;
    setRan(true);
    setBusy(true);
    for (const it of todo) await uploadOne(it);
    running.current = false;
    setBusy(false);
    router.refresh(); // addFile 이 목록을 갱신하지만, 마지막 상태를 확실히 받아 온다
  }

  const doneCount = items.filter((it) => it.status === "done").length;
  const errorCount = items.filter((it) => it.status === "error").length;
  const readyCount = items.filter((it) => it.status === "ready").length;
  const allDone = items.length > 0 && doneCount === items.length;
  const startLabel = readyCount ? `${readyCount + errorCount}개 올리기` : errorCount ? `실패한 ${errorCount}개 다시 올리기` : "올리기";

  return (
    <div className="upl">
      <div
        className={"upl-drop" + (dragOver ? " over" : "") + (busy ? " off" : "")}
        onDragOver={(e) => { e.preventDefault(); if (!busy) setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); if (!busy) addFiles(e.dataTransfer.files); }}
      >
        <Icon name="file" />
        <div>
          <b>파일을 끌어다 놓거나</b>
          <button type="button" className="btn sm" disabled={busy} onClick={() => input.current?.click()}>파일 고르기</button>
        </div>
        <small>PDF · DOCX · JPG · PNG · WEBP · 파일당 30MB, PDF는 50쪽까지</small>
        <input
          ref={input}
          type="file"
          multiple
          accept={ACCEPT_ATTR}
          hidden
          onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }}
        />
      </div>

      {rejected.length > 0 && (
        <ul className="upl-rejected" role="alert">
          {rejected.map((r) => <li key={r}>{r}</li>)}
        </ul>
      )}

      {items.length > 0 && (
        <ul className="upl-list" aria-live="polite">
          {items.map((it) => (
            <li key={it.key} className={"upl-item " + it.status}>
              <div className="ico"><Icon name={it.kind === "photo" ? "image" : "file"} /></div>
              <div className="body">
                {it.status === "ready" || (it.status === "error" && !busy) ? (
                  <input
                    className="upl-title"
                    value={it.title}
                    aria-label={`${it.file.name} 노트 제목`}
                    onChange={(e) => patch(it.key, { title: e.target.value })}
                    disabled={busy}
                  />
                ) : (
                  <b>{it.title || it.file.name}</b>
                )}
                <small>
                  {it.file.name} · {sizeText(it.file.size)} · {it.kind === "photo" ? "사진은 파일만 저장 (글자를 읽지 않아요)" : "글을 추출해 분석해요"}
                </small>
                {it.message && <small className="msg">{it.message}</small>}
              </div>
              <span className="st">
                {(it.status === "uploading" || it.status === "saving") && <span className="spinner" aria-hidden="true" />}
                {it.status === "done" && <Icon name="check" />}
                {STATUS_TEXT[it.status]}
              </span>
              {(it.status === "ready" || it.status === "error") && !busy && (
                <button type="button" className="icon-btn" aria-label={`${it.file.name} 빼기`} onClick={() => setItems((l) => l.filter((x) => x.key !== it.key))}>
                  <Icon name="trash" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {ran && !busy && doneCount + errorCount > 0 && (
        <div className={"upl-summary" + (errorCount ? " warn" : "")} role="status">
          {errorCount ? `${doneCount}개 저장, ${errorCount}개 실패했어요.` : `${doneCount}개 모두 저장했어요. 자료 목록에 추가되었어요.`}
        </div>
      )}

      <div className="modal-actions">
        <button type="button" className="btn" disabled={busy} onClick={onClose}>{doneCount ? "닫기" : "취소"}</button>
        {!allDone && (
          <button type="button" className="btn primary" disabled={busy || readyCount + errorCount === 0} onClick={start}>
            {busy ? <><span className="spinner" aria-hidden="true" />올리는 중…</> : startLabel}
          </button>
        )}
      </div>
    </div>
  );
}
