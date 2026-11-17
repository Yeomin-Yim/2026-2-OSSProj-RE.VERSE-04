"use client";

import { useState } from "react";
import { addNote } from "@/app/(app)/projects/actions";
import { Modal } from "@/components/ui/Modal";
import { useAction, useToast } from "@/components/ui/Toast";

/** 링크 · 메모 추가 */
export function AddNoteModal({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const toast = useToast();
  const { pending, run } = useAction();
  const [kind, setKind] = useState<"link" | "memo">("link");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");

  function save() {
    if (!title.trim()) return toast("이름을 입력해 주세요");
    if (kind === "link" && !url.trim()) return toast("링크 주소를 입력해 주세요");
    if (kind === "memo" && !text.trim()) return toast("메모 내용을 입력해 주세요");
    run(
      () => addNote({ project_id: projectId, kind, title: title.trim(), url: kind === "link" ? url.trim() : "", text: text.trim() }),
      onClose,
    );
  }

  return (
    <Modal title="링크 · 메모 추가" onClose={onClose}>
      <div className="field">
        <div className="seg">
          <button className={kind === "link" ? "on" : ""} onClick={() => setKind("link")}>링크</button>
          <button className={kind === "memo" ? "on" : ""} onClick={() => setKind("memo")}>메모</button>
        </div>
      </div>
      <div className="field">
        <label>이름</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 팀 회의록" />
      </div>
      {kind === "link" && (
        <div className="field">
          <label>링크 주소</label>
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />
        </div>
      )}
      <div className="field">
        <label>{kind === "link" ? "설명 (선택)" : "메모 내용"}</label>
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="분석에 활용할 내용을 적어주세요." />
      </div>
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>취소</button>
        <button className="btn primary" disabled={pending} onClick={save}>{pending ? "저장 중…" : "추가"}</button>
      </div>
    </Modal>
  );
}
