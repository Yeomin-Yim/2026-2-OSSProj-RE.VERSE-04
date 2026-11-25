"use client";

// 그래프 아래 노트 패널 (프로토타입 noteDockHtml · projectDockHtml)
// 입력을 멈추면 0.6초 뒤 graph_notes 에 저장한다. 저장 결과에 따라 '저장 중… / 저장됨 / 저장 실패'를 보여 준다.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { deleteNote, linkNote, updateNote } from "@/app/(app)/graph/actions";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { ScrapButton } from "@/components/student/StudentData";
import type { GraphNote } from "@/lib/server/student/notes";
import type { ScrapLoc } from "@/lib/server/student/scraps";

type SaveState = "saved" | "saving" | "error";

export const noteDate = (iso: string) => {
  const d = new Date(iso);
  if (isNaN(+d)) return "";
  const h = d.getHours(), pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${h < 12 ? "오전" : "오후"} ${h % 12 || 12}:${pad(d.getMinutes())}`;
};

function Badge({ state }: { state: SaveState }) {
  return (
    <span className="save-state" role="status">
      {state === "saving" ? <><Icon name="refresh" /> 저장 중…</> : state === "error" ? <><Icon name="info" /> 저장 실패</> : <><Icon name="check" /> 저장됨</>}
    </span>
  );
}

interface NoteDockProps {
  note: GraphNote;
  projects: { id: string; title: string }[];
  loc: ScrapLoc;
  onChange: (note: GraphNote) => void;
  onDeleted: (id: string) => void;
  onClose: () => void;
}

export function NoteDock({ note, projects, loc, onChange, onDeleted, onClose }: NoteDockProps) {
  const toast = useToast();
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const [state, setState] = useState<SaveState>("saved");
  const [confirm, setConfirm] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef({ title, body });
  const noteRef = useRef(note);
  useEffect(() => { noteRef.current = note; }, [note]);

  async function commit() {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const { title: t, body: b } = latest.current;
    const r = await updateNote(noteRef.current.id, { title: t.trim() || "제목 없음", body: b });
    setState(r.ok ? "saved" : "error");
    if (r.ok && r.data) onChange({ ...noteRef.current, title: t.trim() || "제목 없음", body: b, updated_at: r.data });
    return r.ok;
  }
  function touch(next: { title?: string; body?: string }) {
    latest.current = { ...latest.current, ...next };
    if (next.title !== undefined) onChange({ ...noteRef.current, title: next.title || "제목 없음" });
    setState("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(commit, 600);
  }
  // 닫거나 다른 노트로 바꿀 때 남은 입력을 저장
  useEffect(() => () => { if (timer.current) { clearTimeout(timer.current); void commit(); } }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function toggleLink(pid: string) {
    const on = note.project_ids.includes(pid);
    if (on && note.project_ids.length === 1) return toast("노트는 프로젝트 1개 이상과 연결돼야 해요");
    const ids = on ? note.project_ids.filter((x) => x !== pid) : [...note.project_ids, pid];
    const r = await linkNote(note.id, ids);
    if (!r.ok) return toast("바꾸지 못했어요: " + r.message);
    onChange({ ...note, project_ids: ids });
    toast(on ? "연결을 해제했어요" : "프로젝트와 연결했어요");
  }

  async function remove() {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const r = await deleteNote(note.id);
    toast(r.message || "삭제하지 못했어요");
    if (r.ok) onDeleted(note.id);
    setConfirm(false);
  }

  return (
    <section className="note-dock" aria-label="노트">
      <div className="nd-head">
        <span className="nd-kind"><i />내 노트</span>
        <Badge state={state} />
        <div className="nd-actions">
          <ScrapButton input={{ type: "note", ref_id: note.id, title: title || "제목 없음", meta: { sub: "내 노트", note: body.slice(0, 300) }, loc: { ...loc, note: note.id } }} />
          <button className="btn sm primary" onClick={async () => { if (await commit()) toast("노트를 저장했어요"); else toast("저장하지 못했어요"); }}><Icon name="check" />저장</button>
          <button className="btn sm danger" onClick={() => setConfirm(true)}><Icon name="trash" />삭제</button>
          <button className="icon-btn" onClick={onClose} aria-label="노트 닫기"><Icon name="x" /></button>
        </div>
      </div>
      <input className="nd-title" value={title} maxLength={60} placeholder="노트 제목" aria-label="노트 제목"
        onChange={(e) => { setTitle(e.target.value); touch({ title: e.target.value }); }} />
      <div className="nd-links">
        <span className="lbl">연결 프로젝트</span>
        {projects.map((p) => {
          const on = note.project_ids.includes(p.id);
          return <button key={p.id} className={"pchip" + (on ? " on" : "")} aria-pressed={on} onClick={() => toggleLink(p.id)}>{on ? "✓ " : "+ "}{p.title}</button>;
        })}
      </div>
      <textarea className="nd-body" value={body} placeholder="배운 점, 다음에 해볼 것… 짧게 적어도 괜찮아요." aria-label="노트 본문"
        onChange={(e) => { setBody(e.target.value); touch({ body: e.target.value }); }} />
      <div className="nd-meta"><span>만든 날 {noteDate(note.created_at)}</span><span>수정 {noteDate(note.updated_at)}</span></div>

      {confirm && (
        <Modal onClose={() => setConfirm(false)}>
          <p style={{ margin: "4px 0 18px", lineHeight: 1.6 }}>&quot;{title || "제목 없음"}&quot; 노트를 삭제할까요?</p>
          <div className="modal-actions">
            <button className="btn" onClick={() => setConfirm(false)}>취소</button>
            <button className="btn danger" onClick={remove}>삭제</button>
          </div>
        </Modal>
      )}
    </section>
  );
}

interface ProjectDockProps {
  project: { id: string; title: string };
  notes: GraphNote[];
  loc: ScrapLoc;
  onOpenNote: (id: string) => void;
  onAdd: () => void;
  onClose: () => void;
}

export function ProjectDock({ project, notes, loc, onOpenNote, onAdd, onClose }: ProjectDockProps) {
  const list = [...notes].sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
  return (
    <section className="note-dock" aria-label="프로젝트">
      <div className="nd-head">
        <span className="nd-kind proj"><i />프로젝트</span>
        <h3>{project.title}</h3>
        <div className="nd-actions">
          <ScrapButton input={{ type: "project", ref_id: project.id, title: project.title, meta: { sub: "프로젝트" }, loc: { ...loc, project: project.id } }} />
          <Link className="btn sm" href={`/projects/${project.id}?tab=gnotes`}>프로젝트 관리</Link>
          <button className="btn sm primary" onClick={onAdd}><Icon name="plus" />노트 추가</button>
          <button className="icon-btn" onClick={onClose} aria-label="닫기"><Icon name="x" /></button>
        </div>
      </div>
      {list.length ? (
        <div className="nd-cards">
          {list.map((n) => (
            <button key={n.id} className="nd-card" onClick={() => onOpenNote(n.id)}>
              <b><i />{n.title || "제목 없음"}</b>
              <span className="p">{n.body || <span className="hint">아직 내용이 없어요</span>}</span>
              <small>{noteDate(n.updated_at)}</small>
            </button>
          ))}
        </div>
      ) : (
        <div className="nd-empty">아직 연결된 노트가 없어요. <b>+ 노트 추가</b>로 첫 노트를 남겨보세요.</div>
      )}
    </section>
  );
}

/** 새 노트 창: 제목 + 연결할 프로젝트 (여러 개) */
export function AddGraphNoteModal({ projects, preset, onCreate, onClose }: {
  projects: { id: string; title: string }[];
  preset: string[];
  onCreate: (title: string, pids: string[]) => Promise<boolean>;
  onClose: () => void;
}) {
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [sel, setSel] = useState<string[]>(preset);
  const [busy, setBusy] = useState(false);
  async function ok() {
    if (!sel.length) return toast("연결할 프로젝트를 하나 이상 골라 주세요");
    setBusy(true);
    const done = await onCreate(title, sel);
    setBusy(false);
    if (done) onClose();
  }
  return (
    <Modal title="새 노트" onClose={onClose}>
      <div className="field">
        <label>제목</label>
        <input value={title} maxLength={60} placeholder="예: 인터뷰 질문 만드는 법" onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) ok(); }} />
      </div>
      <div className="field">
        <label>연결할 프로젝트 <span className="hint">· 여러 개 고를 수 있어요</span></label>
        <div className="nd-links" style={{ margin: "2px 0 0" }}>
          {projects.map((p) => {
            const on = sel.includes(p.id);
            return <button key={p.id} type="button" className={"pchip" + (on ? " on" : "")} aria-pressed={on}
              onClick={() => setSel((s) => (on ? s.filter((x) => x !== p.id) : [...s, p.id]))}>{on ? "✓ " : "+ "}{p.title}</button>;
          })}
        </div>
      </div>
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>취소</button>
        <button className="btn primary" disabled={busy} onClick={ok}>{busy ? "만드는 중…" : "노트 만들기"}</button>
      </div>
    </Modal>
  );
}
