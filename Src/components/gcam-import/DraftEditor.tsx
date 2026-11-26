"use client";

// 거캠 가져오기 미리보기: 서버가 만든 초안(draft)을 학생이 고친다.
// 고칠 수 있는 것은 lib/server/gcam-import/README.md 의 표 그대로다:
//   제목 고치기 · 노트를 다른 프로젝트로 옮기기 · 미분류 배정 · 노트 빼기 · 기존 프로젝트에 붙이기
// unit_ids 는 바꾸지 않는다. 본문은 서버가 원문(units)으로 다시 만든다.

import { useMemo, useState } from "react";
import type { GcamUnit } from "@/lib/core/index.ts";
import type { Draft, DraftNote } from "@/lib/server/gcam-import/draft";
import { Icon } from "@/components/ui/Icon";

export type Removed = { note: DraftNote; from: string };

interface Props {
  draft: Draft;
  units: GcamUnit[];
  myProjects: { id: string; title: string }[];
  removed: Removed[];
  onChange: (draft: Draft, removed: Removed[]) => void;
}

type Loc = { p: number; i: number } | { u: number };

const ymd = (d: string | null) => (d ? d.replaceAll("-", ".") : "날짜 없음");
const UNASSIGNED = "u";

export function DraftEditor({ draft, units, myProjects, removed, onChange }: Props) {
  const unitById = useMemo(() => new Map(units.map((u) => [u.id, u])), [units]);
  // 처음엔 AI 가 묶은 프로젝트만 펼친다 (과목 프로젝트는 노트가 많다)
  const [open, setOpen] = useState<Set<number>>(
    () => new Set(draft.projects.flatMap((p, i) => (p.origin === "ai" || p.notes.length <= 4 ? [i] : []))),
  );

  /** 초안을 복사해서 고친 뒤 올려 보낸다 */
  function edit(fn: (d: Draft, r: Removed[]) => void) {
    const d = structuredClone(draft);
    const r = [...removed];
    fn(d, r);
    onChange(d, r);
  }

  function take(d: Draft, loc: Loc): DraftNote {
    if ("p" in loc) return d.projects[loc.p].notes.splice(loc.i, 1)[0];
    const { title, date, unit_ids } = d.unassigned.splice(loc.u, 1)[0];
    return { title, date, unit_ids };
  }

  function move(loc: Loc, to: string) {
    edit((d) => {
      const note = take(d, loc);
      if (to === UNASSIGNED) {
        d.unassigned.push({ ...note, candidates: [], question: "" });
      } else {
        const p = d.projects[Number(to)];
        p.notes.push(note);
        p.notes.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
        setOpen((s) => new Set(s).add(Number(to)));
      }
    });
  }

  function remove(loc: Loc, from: string) {
    edit((d, r) => r.push({ note: take(d, loc), from }));
  }

  function restore(index: number) {
    edit((d, r) => {
      const [{ note }] = r.splice(index, 1);
      d.unassigned.push({ ...note, candidates: [], question: "다시 넣은 노트예요. 어느 프로젝트에 둘까요?" });
    });
  }

  function addProject() {
    edit((d) => {
      d.projects.push({ title: "새 프로젝트", existing_project_id: null, origin: "ai", notes: [], questions: [] });
      setOpen((s) => new Set(s).add(d.projects.length - 1));
    });
  }

  const toggle = (i: number) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });

  const projectOptions = (except?: number) =>
    draft.projects.map((p, i) => ({ value: String(i), label: p.title.trim() || "(제목 없음)" })).filter((o) => Number(o.value) !== except);

  return (
    <div className="imp-editor">
      {/* ───── 미분류: 먼저 보이게 위에 둔다 */}
      {draft.unassigned.length > 0 && (
        <section className="imp-unassigned" aria-labelledby="imp-unassigned-title">
          <div className="imp-sec-head">
            <h4 id="imp-unassigned-title">
              <Icon name="bulb" />어느 프로젝트인지 애매한 노트 <span className="imp-count">{draft.unassigned.length}</span>
            </h4>
            <small>배정하지 않으면 &apos;일반 활동&apos; 프로젝트로 저장돼요.</small>
          </div>
          {draft.unassigned.map((n, u) => (
            <NoteRow
              key={n.unit_ids[0]}
              note={n}
              unitById={unitById}
              question={n.question}
              candidates={n.candidates}
              onTitle={(title) => edit((d) => { d.unassigned[u].title = title; })}
              moveLabel="프로젝트 고르기"
              moveOptions={[{ value: "", label: "일반 활동 (그대로 두기)" }, ...projectOptions()]}
              moveValue=""
              onMove={(to) => to && move({ u }, to)}
              onRemove={() => remove({ u }, "미분류")}
            />
          ))}
        </section>
      )}

      {/* ───── 프로젝트별 노트 */}
      {draft.projects.map((p, pi) => {
        const isOpen = open.has(pi);
        const attached = myProjects.find((m) => m.id === p.existing_project_id);
        return (
          <section key={pi} className={"imp-proj" + (p.notes.length ? "" : " empty")}>
            <div className="imp-proj-head">
              <button type="button" className="imp-fold" aria-expanded={isOpen} aria-label={`${p.title} 노트 ${isOpen ? "접기" : "펼치기"}`} onClick={() => toggle(pi)}>
                <Icon name={isOpen ? "chevD" : "chevR"} />
              </button>
              <input
                className="imp-proj-title"
                value={p.title}
                aria-label="프로젝트 이름"
                onChange={(e) => edit((d) => { d.projects[pi].title = e.target.value; })}
                disabled={!!attached}
                title={attached ? "기존 프로젝트에 이어 저장해서 이름은 그대로예요" : undefined}
              />
              <span className={"imp-origin " + p.origin}>{p.origin === "subject" ? "과목" : "AI 묶음"}</span>
              <span className="imp-count">노트 {p.notes.length}</span>
            </div>

            <div className="imp-attach">
              <label>
                저장할 곳
                <select
                  value={p.existing_project_id ?? ""}
                  onChange={(e) => edit((d) => { d.projects[pi].existing_project_id = e.target.value || null; })}
                >
                  <option value="">같은 이름의 내 프로젝트, 없으면 새로 만들기</option>
                  {myProjects.map((m) => (
                    <option key={m.id} value={m.id}>기존 프로젝트에 이어서: {m.title}</option>
                  ))}
                </select>
              </label>
            </div>

            {p.questions.length > 0 && (
              <ul className="imp-questions">
                {p.questions.map((q) => <li key={q}>{q}</li>)}
              </ul>
            )}

            {isOpen && (
              <div className="imp-notes">
                {p.notes.length === 0 && <div className="imp-empty">노트가 없어요. 이대로 두면 이 프로젝트는 만들지 않아요.</div>}
                {p.notes.map((n, i) => (
                  <NoteRow
                    key={n.unit_ids[0]}
                    note={n}
                    unitById={unitById}
                    onTitle={(title) => edit((d) => { d.projects[pi].notes[i].title = title; })}
                    moveLabel="다른 곳으로 옮기기"
                    moveOptions={[{ value: "", label: "옮기기…" }, ...projectOptions(pi), { value: UNASSIGNED, label: "미분류로" }]}
                    moveValue=""
                    onMove={(to) => to && move({ p: pi, i }, to)}
                    onRemove={() => remove({ p: pi, i }, p.title)}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}

      <button type="button" className="btn imp-add" onClick={addProject}>
        <Icon name="plus" />새 프로젝트 묶음 추가
      </button>

      {/* ───── 뺀 노트 */}
      {removed.length > 0 && (
        <section className="imp-removed">
          <h4>저장하지 않을 노트 <span className="imp-count">{removed.length}</span></h4>
          {removed.map((r, i) => (
            <div key={r.note.unit_ids[0]} className="imp-removed-row">
              <span><b>{r.note.title || "(제목 없음)"}</b><small>{ymd(r.note.date)} · {r.from}에서 뺌</small></span>
              <button type="button" className="btn sm" onClick={() => restore(i)}>되돌리기</button>
            </div>
          ))}
        </section>
      )}

      {draft.excluded.length > 0 && (
        <p className="imp-excluded">
          머리글·빈 칸처럼 기록이 아닌 부분 {draft.excluded.reduce((s, e) => s + e.unit_ids.length, 0)}칸은 저장하지 않아요
          {` (${[...new Set(draft.excluded.map((e) => e.reason))].join(", ")})`}.
        </p>
      )}
    </div>
  );
}

// ───── 노트 한 줄

interface RowProps {
  note: DraftNote;
  unitById: Map<string, GcamUnit>;
  question?: string;
  candidates?: string[];
  onTitle: (title: string) => void;
  moveLabel: string;
  moveOptions: { value: string; label: string }[];
  moveValue: string;
  onMove: (to: string) => void;
  onRemove: () => void;
}

function NoteRow({ note, unitById, question, candidates, onTitle, moveLabel, moveOptions, moveValue, onMove, onRemove }: RowProps) {
  const [show, setShow] = useState(false);
  const body = note.unit_ids.map((id) => unitById.get(id)).filter((u): u is GcamUnit => !!u);
  const uncertain = body.filter((u) => u.uncertain).length;

  return (
    <div className="imp-note">
      <div className="imp-note-main">
        <span className="imp-date">{ymd(note.date)}</span>
        <input
          className={"imp-note-title" + (note.title.trim() ? "" : " invalid")}
          value={note.title}
          aria-label="노트 제목"
          aria-invalid={!note.title.trim()}
          placeholder="노트 제목을 적어 주세요"
          onChange={(e) => onTitle(e.target.value)}
        />
        <div className="imp-note-actions">
          <button type="button" className="btn sm" aria-expanded={show} onClick={() => setShow((s) => !s)}>
            {show ? "본문 접기" : "본문 보기"}
          </button>
          <select aria-label={moveLabel} value={moveValue} onChange={(e) => onMove(e.target.value)}>
            {moveOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <button type="button" className="icon-btn" aria-label={`${note.title || "노트"} 빼기 (저장 안 함)`} title="빼기 (저장 안 함)" onClick={onRemove}>
            <Icon name="trash" />
          </button>
        </div>
      </div>
      {(question || (candidates && candidates.length > 0)) && (
        <p className="imp-q">
          {question}
          {candidates && candidates.length > 0 && <span> 후보: {candidates.join(", ")}</span>}
        </p>
      )}
      {show && (
        <div className="imp-body">
          {uncertain > 0 && <p className="hint">노란색 부분은 글자 읽기가 확실하지 않은 곳이에요. 저장한 뒤 본문을 고칠 수 있어요.</p>}
          {body.map((u) => (
            <p key={u.id} className={"imp-unit " + u.type + (u.uncertain ? " uncertain" : "")}>{u.text}</p>
          ))}
        </div>
      )}
    </div>
  );
}
