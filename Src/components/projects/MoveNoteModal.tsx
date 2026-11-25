"use client";

// 노트를 다른 프로젝트로 옮기기. 서버의 moveRecord(recordId, projectId)를 그대로 부른다.
// 복사가 아니라 소속만 바뀐다: 기록 id · 본문 · 버전은 그대로, 태그도 함께 옮겨진다 (lib/server/projects/records.ts).
// 다른 사람의 프로젝트로는 DB 권한(RLS)이 막는다. 화면은 내 프로젝트 목록만 보여 준다.

import { useState } from "react";
import { moveRecord } from "@/app/(app)/projects/actions";
import { Modal } from "@/components/ui/Modal";
import { useAction } from "@/components/ui/Toast";
import { STATUS_LABEL } from "./format";
import type { ProjectRow, RecordView } from "./types";

interface Props {
  record: Pick<RecordView, "id" | "title" | "project_id">;
  projects: Pick<ProjectRow, "id" | "title" | "status" | "record_count">[];
  onClose: () => void;
  onMoved?: () => void;
}

export function MoveNoteModal({ record, projects, onClose, onMoved }: Props) {
  const { pending, run } = useAction();
  const [target, setTarget] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const others = projects.filter((p) => p.id !== record.project_id);
  const current = projects.find((p) => p.id === record.project_id);
  const q = query.trim().toLowerCase();
  const shown = q ? others.filter((p) => p.title.toLowerCase().includes(q)) : others;
  const targetTitle = others.find((p) => p.id === target)?.title;

  function move() {
    if (!target || pending) return;
    run(() => moveRecord(record.id, target), () => { onMoved?.(); onClose(); });
  }

  return (
    <Modal title="다른 프로젝트로 옮기기" onClose={() => !pending && onClose()}>
      <p className="mv-lead">
        <b>&quot;{record.title}&quot;</b>
        {current && <> 을(를) <span className="mv-from">{current.title}</span>에서</>} 옮겨요. 본문과 버전, 태그는 그대로 따라가요.
      </p>

      {others.length === 0 ? (
        <div className="empty-note">옮길 수 있는 다른 프로젝트가 없어요. 먼저 새 프로젝트를 만들어 주세요.</div>
      ) : (
        <>
          {others.length > 6 && (
            <div className="field">
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="프로젝트 이름으로 찾기" aria-label="프로젝트 찾기" />
            </div>
          )}
          <div className="mv-list" role="radiogroup" aria-label="옮길 프로젝트">
            {shown.map((p) => (
              <label key={p.id} className={"mv-item" + (target === p.id ? " on" : "")}>
                <input type="radio" name="move-target" value={p.id} checked={target === p.id} onChange={() => setTarget(p.id)} />
                <span>
                  <b>{p.title}</b>
                  <small>{STATUS_LABEL[p.status]} · 자료 {p.record_count}</small>
                </span>
              </label>
            ))}
            {shown.length === 0 && <div className="empty-note">찾은 프로젝트가 없어요.</div>}
          </div>
        </>
      )}

      <div className="modal-actions" style={{ marginTop: 14 }}>
        <button className="btn" disabled={pending} onClick={onClose}>취소</button>
        <button className="btn primary" disabled={!target || pending} onClick={move}>
          {pending ? <><span className="spinner" aria-hidden="true" />옮기는 중…</> : targetTitle ? `'${targetTitle.length > 12 ? targetTitle.slice(0, 12) + "…" : targetTitle}'로 옮기기` : "옮기기"}
        </button>
      </div>
    </Modal>
  );
}
