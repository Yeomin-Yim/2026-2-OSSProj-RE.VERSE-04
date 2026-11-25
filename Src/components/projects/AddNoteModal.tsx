"use client";

import { useState } from "react";
import { addNote } from "@/app/(app)/projects/actions";
import { Modal } from "@/components/ui/Modal";
import { useAction, useToast } from "@/components/ui/Toast";
import { FileUploadPanel } from "./FileUploadPanel";

export type AddKind = "file" | "link" | "memo";

/** 자료 추가: 파일(PDF·DOCX·사진) · 링크 · 메모 */
export function AddNoteModal({ projectId, initialKind = "link", onClose }: { projectId: string; initialKind?: AddKind; onClose: () => void }) {
  const toast = useToast();
  const { pending, run } = useAction();
  const [kind, setKind] = useState<AddKind>(initialKind);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [uploading, setUploading] = useState(false);

  // 파일을 올리는 동안에는 닫히지 않게 한다 (Esc · 바깥 누르기 포함)
  const close = () => {
    if (uploading) return toast("파일을 올리는 중이에요. 끝날 때까지 기다려 주세요");
    onClose();
  };

  function save() {
    if (kind === "file") return;
    if (!title.trim()) return toast("이름을 입력해 주세요");
    if (kind === "link" && !url.trim()) return toast("링크 주소를 입력해 주세요");
    if (kind === "memo" && !text.trim()) return toast("메모 내용을 입력해 주세요");
    run(
      () => addNote({ project_id: projectId, kind, title: title.trim(), url: kind === "link" ? url.trim() : "", text: text.trim() }),
      onClose,
    );
  }

  return (
    <Modal title="자료 추가" onClose={close}>
      <div className="field">
        <div className="seg" role="tablist" aria-label="자료 종류">
          {(["file", "link", "memo"] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={kind === k}
              className={kind === k ? "on" : ""}
              disabled={uploading}
              onClick={() => setKind(k)}
            >
              {k === "file" ? "파일" : k === "link" ? "링크" : "메모"}
            </button>
          ))}
        </div>
      </div>

      {kind === "file" ? (
        <FileUploadPanel projectId={projectId} onClose={close} onBusyChange={setUploading} />
      ) : (
        <>
          <div className="field">
            <label htmlFor="add-note-title">이름</label>
            <input id="add-note-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 팀 회의록" />
          </div>
          {kind === "link" && (
            <div className="field">
              <label htmlFor="add-note-url">링크 주소</label>
              <input id="add-note-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />
            </div>
          )}
          <div className="field">
            <label htmlFor="add-note-text">{kind === "link" ? "설명 (선택)" : "메모 내용"}</label>
            <textarea id="add-note-text" value={text} onChange={(e) => setText(e.target.value)} placeholder="분석에 활용할 내용을 적어주세요." />
          </div>
          <div className="modal-actions">
            <button className="btn" onClick={onClose}>취소</button>
            <button className="btn primary" disabled={pending} onClick={save}>{pending ? "저장 중…" : "추가"}</button>
          </div>
        </>
      )}
    </Modal>
  );
}
