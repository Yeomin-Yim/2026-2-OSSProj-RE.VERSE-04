"use client";

import { useEffect, useState } from "react";
import { deleteRecord, setResult } from "@/app/(app)/projects/actions";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { useAction } from "@/components/ui/Toast";
import { NoteModal } from "./NoteModal";
import { kindIcon, kindLabel, ymd } from "./format";
import type { RecordView, TagInfo } from "./types";

interface Props {
  records: RecordView[];
  empty: string;
  userName: string;
  tagInfo: TagInfo;
}

/** 자료 목록. 한 줄마다 ⋮ 메뉴(내용 보기 · 결과물 표시 · 삭제)가 있다. */
export function NoteList({ records, empty, userName, tagInfo }: Props) {
  const { pending, run } = useAction();
  const [menu, setMenu] = useState<{ id: string; top: number; left: number } | null>(null);
  const [viewId, setViewId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // 메뉴 바깥을 누르면 닫는다
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [menu]);

  if (!records.length) return <div className="empty-note">{empty}</div>;

  const byId = (id: string | null) => records.find((r) => r.id === id);
  const menuRecord = byId(menu?.id ?? null);
  const viewing = byId(viewId);
  const deleting = byId(deleteId);

  function openMenu(e: React.MouseEvent<HTMLButtonElement>, id: string) {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const left = Math.max(8, Math.min(window.innerWidth - 180, rect.right - 160));
    setMenu(menu?.id === id ? null : { id, top: rect.bottom + 4, left });
  }

  return (
    <div style={{ marginTop: 12 }}>
      {records.map((r) => (
        <div className="note" key={r.id}>
          <div className="ico"><Icon name={kindIcon(r.kind)} /></div>
          <div className="nm">
            <b>
              {r.title}
              {r.is_result && <span className="tag-result">결과물</span>}
            </b>
            <small>{ymd(r.recorded_at)} · {userName}</small>
          </div>
          <span className="type">{kindLabel(r.kind)}</span>
          <button className="icon-btn" aria-label="메뉴" onClick={(e) => openMenu(e, r.id)}>
            <Icon name="more" />
          </button>
        </div>
      ))}

      {menu && menuRecord && (
        <div className="menu" style={{ position: "fixed", zIndex: 120, top: menu.top, left: menu.left, right: "auto" }}>
          <button onClick={() => setViewId(menuRecord.id)}><Icon name="eye" />내용 보기</button>
          <button disabled={pending} onClick={() => run(() => setResult(menuRecord.id, !menuRecord.is_result))}>
            <Icon name="star" />{menuRecord.is_result ? "결과물 표시 해제" : "결과물로 표시"}
          </button>
          <button className="danger" onClick={() => setDeleteId(menuRecord.id)}><Icon name="trash" />삭제</button>
        </div>
      )}

      {viewing && <NoteModal record={viewing} tagInfo={tagInfo} onClose={() => setViewId(null)} />}

      {deleting && (
        <Modal onClose={() => setDeleteId(null)}>
          <p style={{ margin: "4px 0 18px", lineHeight: 1.6 }}>&quot;{deleting.title}&quot; 자료를 삭제할까요?</p>
          <div className="modal-actions">
            <button className="btn" onClick={() => setDeleteId(null)}>취소</button>
            <button
              className="btn danger"
              disabled={pending}
              onClick={() => run(() => deleteRecord(deleting.id), () => setDeleteId(null))}
            >
              삭제
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
