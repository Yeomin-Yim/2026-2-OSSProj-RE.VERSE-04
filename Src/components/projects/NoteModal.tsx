"use client";

import { useState } from "react";
import { editRecord } from "@/app/(app)/projects/actions";
import { Modal } from "@/components/ui/Modal";
import { useAction } from "@/components/ui/Toast";
import { kindLabel } from "./format";
import type { RecordView, TagInfo } from "./types";

/** 자료 내용 보기: 본문 → 문장별 태그. '본문 수정'을 누르면 고칠 수 있다. */
export function NoteModal({ record, tagInfo, onClose }: { record: RecordView; tagInfo: TagInfo; onClose: () => void }) {
  const { pending, run } = useAction();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(record.raw_text);

  const tagsOf = (sid: string) => record.tags.filter((t) => t.sid === sid);

  if (editing) {
    return (
      <Modal title={record.title} onClose={onClose}>
        <div className="field">
          <label>본문 · 저장하면 버전 {record.version + 1}이 돼요</label>
          <textarea value={text} onChange={(e) => setText(e.target.value)} style={{ minHeight: 220 }} />
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={() => setEditing(false)}>취소</button>
          <button
            className="btn primary"
            disabled={pending}
            onClick={() => run(() => editRecord(record.id, text), () => setEditing(false))}
          >
            {pending ? "저장 중…" : "저장"}
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={record.title} onClose={onClose}>
      {record.raw_text ? (
        <div className="note-body">{record.raw_text}</div>
      ) : (
        <div className="empty-note">미리볼 본문이 없는 자료예요 ({kindLabel(record.kind)}).</div>
      )}
      {record.url && <p className="hint" style={{ marginTop: 8 }}>링크: {record.url}</p>}

      {record.sentences.length > 0 && (
        <>
          <h4 className="sub-title">문장 · 태그 <span className="hint">버전 {record.version}</span></h4>
          <ul className="sent-list">
            {record.sentences.map((s) => (
              <li key={s.sid}>
                <span className="sid">{s.sid}</span>
                <span>
                  {s.text}
                  <br />
                  {tagsOf(s.sid).map((t) => (
                    <span key={t.code} className={"tag-chip " + (tagInfo[t.code]?.group ?? "")} title={`"${t.matched}"`}>
                      {tagInfo[t.code]?.label ?? t.code}
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="modal-actions" style={{ marginTop: 16 }}>
        <button className="btn left" onClick={() => setEditing(true)}>본문 수정</button>
        <button className="btn primary" onClick={onClose}>닫기</button>
      </div>
    </Modal>
  );
}
