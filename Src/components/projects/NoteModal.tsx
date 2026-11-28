"use client";

import { useEffect, useState } from "react";
import { editRecord, openFile } from "@/app/(app)/projects/actions";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { useAction, useToast } from "@/components/ui/Toast";
import { excerpt, kindLabel, ymd } from "./format";
import type { RecordView } from "./types";

interface Props {
  record: RecordView;
  onClose: () => void;
  /** 있으면 '다른 프로젝트로 옮기기' 버튼을 보여 준다 */
  onMove?: () => void;
}

/**
 * 자료 내용 보기: 유형·날짜·버전 → 본문. '본문 수정'을 누르면 고칠 수 있다. 파일 자료는 원본을 열 수 있다.
 * 문장 분리 결과·태그는 DB 에 그대로 두고 화면에서만 보여 주지 않는다 (D007 · 그래프·추천·포트폴리오 근거로 계속 쓰인다).
 */
export function NoteModal({ record, onClose, onMove }: Props) {
  const toast = useToast();
  const { pending, run } = useAction();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(record.raw_text);
  const [photo, setPhoto] = useState<{ url?: string; error?: string } | null>(null);
  const [opening, setOpening] = useState(false);

  const isPhoto = record.kind === "photo" && record.has_file;

  // 사진은 열 때 미리보기 주소(1분 유효)를 받아 온다
  useEffect(() => {
    if (!isPhoto) return;
    let alive = true;
    openFile(record.id)
      .then((r) => alive && setPhoto(r.ok ? { url: r.url } : { error: r.message }))
      .catch(() => alive && setPhoto({ error: "사진을 불러오지 못했어요." }));
    return () => { alive = false; };
  }, [isPhoto, record.id]);

  /** 원본 파일을 새 창으로 연다. 창은 먼저 열어 둔다 (주소를 기다린 뒤 열면 브라우저가 팝업으로 막는다) */
  async function openOriginal() {
    if (opening) return;
    setOpening(true);
    const win = window.open("", "_blank");
    if (win) win.opener = null;
    try {
      const r = await openFile(record.id);
      if (!r.ok) { win?.close(); toast(r.message); return; }
      if (win) win.location.href = r.url;
      else window.location.href = r.url;
    } catch {
      win?.close();
      toast("파일을 열지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setOpening(false);
    }
  }

  if (editing) {
    return (
      <Modal title={record.title} onClose={onClose}>
        <div className="field">
          <label htmlFor="note-edit">본문 · 저장하면 버전 {record.version + 1}이 돼요</label>
          <textarea id="note-edit" value={text} onChange={(e) => setText(e.target.value)} style={{ minHeight: 220 }} />
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
      <div className="nv-meta">
        <span>{kindLabel(record.kind)}</span><i className="dot" />
        <span>{ymd(record.recorded_at)}</span><i className="dot" />
        <span>버전 {record.version}</span>
        {record.is_result && <span className="tag-result">결과물</span>}
      </div>
      {isPhoto && (
        <div className="nv-photo">
          {photo?.url ? (
            // eslint-disable-next-line @next/next/no-img-element -- 1분짜리 서명 주소라 next/image 최적화를 쓰지 않는다
            <img src={photo.url} alt={record.title} />
          ) : photo?.error ? (
            <div className="empty-note">{photo.error}</div>
          ) : (
            <div className="nv-loading"><span className="spinner" aria-hidden="true" />사진을 불러오는 중…</div>
          )}
          <p className="hint">사진은 증빙으로 파일만 저장돼요. 사진 속 글자는 읽지 않아 태그가 붙지 않아요.</p>
        </div>
      )}

      {/* 내용 미리보기: 원문 앞부분 (서버 요약이 없어 발췌 · "요약"이라 부르지 않음, D007) */}
      {record.raw_text.trim().length > 160 && (
        <div className="nv-preview">
          <b>내용 미리보기</b>
          <p>{excerpt(record, 160).text}</p>
        </div>
      )}
      {record.raw_text ? (
        <>
          {record.raw_text.trim().length > 160 && <h4 className="nv-sub">전체 내용</h4>}
          <div className="note-body">{record.raw_text}</div>
        </>
      ) : (
        !isPhoto && (
          <div className="empty-note">
            {record.has_file ? "파일에서 글자를 찾지 못했어요 (스캔한 PDF 등). 원본 파일은 열어 볼 수 있어요." : `미리볼 본문이 없는 자료예요 (${kindLabel(record.kind)}).`}
          </div>
        )
      )}
      {record.url && (
        <p className="hint" style={{ marginTop: 8 }}>
          링크: <a href={record.url} target="_blank" rel="noopener noreferrer" className="nv-link">{record.url}</a>
        </p>
      )}

      <div className="modal-actions nv-actions" style={{ marginTop: 16 }}>
        <button className="btn" onClick={() => setEditing(true)}>본문 수정</button>
        {record.has_file && (
          <button className="btn" disabled={opening} onClick={openOriginal}>
            <Icon name="download" />{opening ? "여는 중…" : "원본 파일"}
          </button>
        )}
        {onMove && (
          <button className="btn" onClick={onMove}><Icon name="move" />옮기기</button>
        )}
        <button className="btn primary push" onClick={onClose}>닫기</button>
      </div>
    </Modal>
  );
}
