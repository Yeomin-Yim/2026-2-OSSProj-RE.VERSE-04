"use client";

import { useEffect, useState } from "react";
import { deleteRecord, setResult } from "@/app/(app)/projects/actions";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { useAction } from "@/components/ui/Toast";
import { MoveNoteModal } from "./MoveNoteModal";
import { NoteModal } from "./NoteModal";
import { kindIcon, kindLabel, ymd } from "./format";
import type { ProjectRow, RecordView, TagInfo } from "./types";

interface Props {
  records: RecordView[];
  empty: string;
  userName: string;
  /** 예전 호출과 맞추려고 남겨 둔 값. 자료 화면에서는 태그를 보여 주지 않는다 (D007) */
  tagInfo?: TagInfo;
  /** 옮길 수 있는 내 프로젝트 목록. 없으면 '옮기기' 메뉴를 숨긴다 */
  projects?: ProjectRow[];
}

/** 자료 목록: 제목 · 유형 · 날짜 (내용 미리보기는 자료를 눌러 연 창에서). 한 줄마다 ⋮ 메뉴(내용 보기 · 결과물 표시 · 다른 프로젝트로 옮기기 · 삭제)가 있다. */
export function NoteList({ records, empty, userName, projects }: Props) {
  const { pending, run } = useAction();
  const [menu, setMenu] = useState<{ id: string; top: number; left: number } | null>(null);
  const [viewId, setViewId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [moveId, setMoveId] = useState<string | null>(null);

  // 메뉴 바깥을 누르거나 Esc 를 누르면 닫는다
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("click", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  if (!records.length) return <div className="empty-note">{empty}</div>;

  const byId = (id: string | null) => records.find((r) => r.id === id);
  const menuRecord = byId(menu?.id ?? null);
  const viewing = byId(viewId);
  const deleting = byId(deleteId);
  const moving = byId(moveId);
  const canMove = !!projects && projects.length > 1;

  function openMenu(e: React.MouseEvent<HTMLButtonElement>, id: string) {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const left = Math.max(8, Math.min(window.innerWidth - 200, rect.right - 180));
    setMenu(menu?.id === id ? null : { id, top: rect.bottom + 4, left });
  }

  return (
    <div style={{ marginTop: 12 }}>
      {records.map((r) => {
        return (
        <div className="note" key={r.id}>
          <div className="ico"><Icon name={kindIcon(r.kind)} /></div>
          <button type="button" className="nm note-open" onClick={() => setViewId(r.id)} aria-label={`${r.title} 내용 보기`}>
            <b>
              {r.title}
              {r.is_result && <span className="tag-result">결과물</span>}
            </b>
            <small>{ymd(r.recorded_at)} · {userName}{r.has_file ? " · 원본 파일" : ""}</small>
          </button>
          <span className="type">{kindLabel(r.kind)}</span>
          <button className="icon-btn" aria-label={`${r.title} 메뉴`} aria-haspopup="menu" aria-expanded={menu?.id === r.id} onClick={(e) => openMenu(e, r.id)}>
            <Icon name="more" />
          </button>
        </div>
        );
      })}

      {menu && menuRecord && (
        <div className="menu" role="menu" style={{ position: "fixed", zIndex: 120, top: menu.top, left: menu.left, right: "auto" }}>
          <button role="menuitem" onClick={() => setViewId(menuRecord.id)}><Icon name="eye" />내용 보기</button>
          <button role="menuitem" disabled={pending} onClick={() => run(() => setResult(menuRecord.id, !menuRecord.is_result))}>
            <Icon name="star" />{menuRecord.is_result ? "결과물 표시 해제" : "결과물로 표시"}
          </button>
          {canMove && (
            <button role="menuitem" onClick={() => setMoveId(menuRecord.id)}><Icon name="move" />다른 프로젝트로 옮기기</button>
          )}
          <button role="menuitem" className="danger" onClick={() => setDeleteId(menuRecord.id)}><Icon name="trash" />삭제</button>
        </div>
      )}

      {viewing && (
        <NoteModal
          record={viewing}
          onClose={() => setViewId(null)}
          onMove={canMove ? () => setMoveId(viewing.id) : undefined}
        />
      )}

      {moving && projects && (
        <MoveNoteModal record={moving} projects={projects} onClose={() => setMoveId(null)} onMoved={() => setViewId(null)} />
      )}

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
