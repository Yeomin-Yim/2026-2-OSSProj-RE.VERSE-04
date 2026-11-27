"use client";

// 거캠 가져오기 미리보기: 서버가 만든 초안(draft)을 학생이 고친다 (판단기록 G1).
// 화면 순서 = 학생이 할 일 순서:
//   ① 요약판 (무엇이 어디로 가는지 한눈에) ② 확인 필요 (정말 애매한 노트만, 버튼으로 고르기)
//   ③ 프로젝트 (AI 가 묶은 팀·개인주제 프로젝트) ④ 과목 수업 · 학교생활 · 활동 없던 날 (접어 둠, 펼쳐서 옮길 수 있음)
// unit_ids 는 바꾸지 않는다. 본문은 서버가 원문(units)으로 다시 만든다.

import { useMemo, useState } from "react";
import type { GcamUnit } from "@/lib/core/index.ts";
import type { Draft, DraftNote, DraftProject } from "@/lib/server/gcam-import/draft";
import { Icon } from "@/components/ui/Icon";

export type Removed = { note: DraftNote; from: string };

interface Props {
  draft: Draft;
  units: GcamUnit[];
  myProjects: { id: string; title: string }[];
  removed: Removed[];
  onChange: (draft: Draft, removed: Removed[]) => void;
}

type Unassigned = Draft["unassigned"][number];
type Loc = { p: number; i: number } | { u: number } | { s: number };

/** 학생에게 확인할 노트인가 (kind 가 없는 이전 초안은 모두 확인) */
export const needsAnswer = (n: Unassigned) => n.kind !== "school";
const PERSONAL = /개주프|개인\s?주제|개인\s?성장|나를\s?찾는/u;
const ymd = (d: string | null) => (d ? `${Number(d.slice(5, 7))}.${Number(d.slice(8, 10))}` : "—");
/** 코드가 붙인 똑같은 질문은 보여 주지 않는다 (AI 가 그 노트에 맞춰 쓴 질문만) */
const GENERIC_Q = /^(어느 프로젝트의 기록인가요\?|프로젝트 진행 기록 같아요\. 어느 프로젝트에 둘까요\?|다시 넣은 노트예요\. 어디에 둘까요\?)$/;
const md = (d: string) => `${Number(d.slice(5, 7))}.${Number(d.slice(8, 10))}`;

function period(notes: DraftNote[]): string | null {
  const ds = notes.map((n) => n.date).filter((d): d is string => !!d).sort();
  if (!ds.length) return null;
  return ds[0] === ds.at(-1) ? md(ds[0]) : `${md(ds[0])} – ${md(ds.at(-1)!)}`;
}

export function DraftEditor({ draft, units, myProjects, removed, onChange }: Props) {
  const unitById = useMemo(() => new Map(units.map((u) => [u.id, u])), [units]);
  const skipped = draft.skipped ?? [];
  const ask = draft.unassigned.map((n, u) => ({ n, u })).filter(({ n }) => needsAnswer(n));
  const school = draft.unassigned.map((n, u) => ({ n, u })).filter(({ n }) => !needsAnswer(n));
  const ai = draft.projects.map((p, i) => ({ p, i })).filter(({ p }) => p.origin !== "subject");
  const subjects = draft.projects.map((p, i) => ({ p, i })).filter(({ p }) => p.origin === "subject" && p.notes.length);

  // 처음엔 모두 접는다: 기간·노트 수·대표 노트만 보고, 고칠 때 펼친다
  const [open, setOpen] = useState<Set<number>>(() => new Set());
  const [fold, setFold] = useState({ subjects: true, school: true, skipped: true });

  function edit(fn: (d: Draft, r: Removed[]) => void) {
    const d = structuredClone(draft);
    const r = [...removed];
    d.skipped ??= [];
    fn(d, r);
    onChange(d, r);
  }

  function take(d: Draft, loc: Loc): DraftNote {
    if ("p" in loc) return d.projects[loc.p].notes.splice(loc.i, 1)[0];
    if ("u" in loc) {
      const { title, date, unit_ids } = d.unassigned.splice(loc.u, 1)[0];
      return { title, date, unit_ids };
    }
    const { title, date, unit_ids } = d.skipped!.splice(loc.s, 1)[0];
    return { title, date, unit_ids };
  }

  const intoProject = (d: Draft, index: number, note: DraftNote) => {
    const p = d.projects[index];
    p.notes.push(note);
    p.notes.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
    setOpen((s) => new Set(s).add(index));
  };

  /** 옮기기. to: 프로젝트 번호 · "general"(일반 활동) */
  function move(loc: Loc, to: number | "general") {
    edit((d) => {
      const note = take(d, loc);
      if (to === "general") d.unassigned.push({ ...note, kind: "school", candidates: [], question: "" });
      else intoProject(d, to, note);
    });
  }

  /** 확인 카드에서 후보 프로젝트 이름을 고름: 초안에 있으면 거기로, 내 기존 프로젝트면 이어 붙일 묶음을 만든다 */
  function pick(u: number, title: string) {
    edit((d) => {
      const note = take(d, { u });
      let index = d.projects.findIndex((p) => p.title.trim() === title.trim());
      if (index < 0) {
        const mine = myProjects.find((m) => m.title.trim() === title.trim());
        d.projects.push({ title, existing_project_id: mine?.id ?? null, origin: "ai", notes: [], questions: [] });
        index = d.projects.length - 1;
      }
      intoProject(d, index, note);
    });
  }

  function remove(loc: Loc, from: string) {
    edit((d, r) => r.push({ note: take(d, loc), from }));
  }

  function restore(index: number) {
    edit((d, r) => {
      const [{ note }] = r.splice(index, 1);
      d.unassigned.push({ ...note, kind: "unsure", candidates: [], question: "다시 넣은 노트예요. 어디에 둘까요?" });
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
    draft.projects
      .map((p, i) => ({ value: String(i), label: (p.origin === "subject" ? "과목 · " : "") + (p.title.trim() || "(제목 없음)") }))
      .filter((o) => Number(o.value) !== except);

  const jump = (id: string, open?: keyof typeof fold) => {
    if (open) setFold((f) => ({ ...f, [open]: false }));
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const aiNotes = ai.reduce((s, { p }) => s + p.notes.length, 0);
  const subjectNotes = subjects.reduce((s, { p }) => s + p.notes.length, 0);

  return (
    <div className="imp-editor">
      {/* ───── ① 요약판 */}
      <div className="imp-overview" role="list" aria-label="정리 결과">
        <Stat tone="proj" icon="graph" label="프로젝트" value={ai.filter(({ p }) => p.notes.length).length} sub="" onClick={() => jump("imp-sec-proj")} />
        <Stat tone="subj" icon="file" label="과목 수업" value={subjects.length} sub="" onClick={() => jump("imp-sec-subj", "subjects")} />
        <Stat tone="school" icon="home" label="학교생활" value={school.length} sub="" onClick={() => jump("imp-sec-school", "school")} />
        <Stat
          tone={ask.length ? "ask" : "done"}
          icon={ask.length ? "bulb" : "check"}
          label="확인 필요"
          value={ask.length}
          sub={ask.length ? "골라 주세요" : "없음"}
          onClick={() => jump(ask.length ? "imp-sec-ask" : "imp-sec-proj")}
        />
      </div>

      {/* ───── ② 확인 필요: 정말 애매한 노트만 */}
      {ask.length > 0 && (
        <section id="imp-sec-ask" className="imp-sec imp-ask" aria-labelledby="imp-ask-title">
          <div className="imp-sec-head">
            <h4 id="imp-ask-title" title="고르지 않으면 '일반 활동'에 저장돼요. 나중에 옮길 수도 있어요."><Icon name="bulb" />어디에 둘까요? <span className="imp-count">{ask.length}</span></h4>
          </div>
          {ask.map(({ n, u }) => (
            <AskCard
              key={n.unit_ids[0]}
              note={n}
              unitById={unitById}
              otherOptions={projectOptions().filter((o) => !n.candidates.includes(draft.projects[Number(o.value)].title))}
              onTitle={(title) => edit((d) => { d.unassigned[u].title = title; })}
              onPick={(title) => pick(u, title)}
              onMove={(to) => move({ u }, to)}
              onSkip={() => remove({ u }, "확인 필요")}
            />
          ))}
        </section>
      )}

      {/* ───── ③ 프로젝트 */}
      <section id="imp-sec-proj" className="imp-sec">
        <div className="imp-sec-head">
          <h4 title="이름을 누르면 고칠 수 있어요. 펼치면 노트를 옮길 수 있어요."><Icon name="graph" />프로젝트 <span className="imp-count">{ai.length}</span></h4>
        </div>
        {ai.map(({ p, i }) => (
          <ProjectCard
            key={i}
            project={p}
            index={i}
            open={open.has(i)}
            onToggle={() => toggle(i)}
            myProjects={myProjects}
            unitById={unitById}
            projectOptions={projectOptions(i)}
            edit={edit}
            onMove={(ni, to) => move({ p: i, i: ni }, to)}
            onRemove={(ni) => remove({ p: i, i: ni }, p.title)}
          />
        ))}
        <button type="button" className="btn sm imp-add" onClick={addProject}>
          <Icon name="plus" />프로젝트 묶음 추가
        </button>
      </section>

      {/* ───── ④ 과목 수업 */}
      {subjects.length > 0 && (
        <section id="imp-sec-subj" className="imp-sec imp-fold-sec">
          <FoldHead
            open={!fold.subjects}
            onToggle={() => setFold((f) => ({ ...f, subjects: !f.subjects }))}
            icon="file"
            title="과목 수업"
            count={subjectNotes}
            hint="오전 교육과정 기록. 과목마다 한 프로젝트에 계속 쌓여요."
          />
          {fold.subjects ? (
            <div className="imp-chips">
              {subjects.map(({ p }) => <span key={p.title} className="imp-chip subj">{p.title} <b>{p.notes.length}</b></span>)}
            </div>
          ) : (
            subjects.map(({ p, i }) => (
              <ProjectCard
                key={i}
                project={p}
                index={i}
                open={open.has(i)}
                onToggle={() => toggle(i)}
                myProjects={myProjects}
                unitById={unitById}
                projectOptions={projectOptions(i)}
                edit={edit}
                onMove={(ni, to) => move({ p: i, i: ni }, to)}
                onRemove={(ni) => remove({ p: i, i: ni }, p.title)}
                compact
              />
            ))
          )}
        </section>
      )}

      {/* ───── ④ 학교생활·행사 → 일반 활동 */}
      {school.length > 0 && (
        <section id="imp-sec-school" className="imp-sec imp-fold-sec">
          <FoldHead
            open={!fold.school}
            onToggle={() => setFold((f) => ({ ...f, school: !f.school }))}
            icon="home"
            title="학교생활·행사"
            count={school.length}
            hint="오리엔테이션·학생자치·강연처럼 프로젝트가 아닌 활동. '일반 활동'에 저장돼요."
            dest="일반 활동"
          />
          {fold.school ? (
            <div className="imp-chips">
              {school.slice(0, 6).map(({ n }) => <span key={n.unit_ids[0]} className="imp-chip school">{n.title.length > 12 ? n.title.slice(0, 12) + "…" : n.title}</span>)}
              {school.length > 6 && <span className="imp-chip more">외 {school.length - 6}개</span>}
            </div>
          ) : (
            <div className="imp-notes">
              {school.map(({ n, u }) => (
                <NoteRow
                  key={n.unit_ids[0]}
                  note={n}
                  unitById={unitById}
                  onTitle={(title) => edit((d) => { d.unassigned[u].title = title; })}
                  moveOptions={projectOptions()}
                  onMove={(to) => move({ u }, Number(to))}
                  onRemove={() => remove({ u }, "학교생활")}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/* ───── ④ 활동이 없던 날 */}
      {skipped.length > 0 && (
        <section className="imp-sec imp-fold-sec quiet">
          <FoldHead
            open={!fold.skipped}
            onToggle={() => setFold((f) => ({ ...f, skipped: !f.skipped }))}
            icon="x"
            title="활동이 없던 날"
            count={skipped.length}
            hint="아파서 쉬었거나 기록할 활동이 없던 날. 저장하지 않아요."
            dest="저장 안 함"
          />
          {!fold.skipped && skipped.map((n, s) => (
            <div key={n.unit_ids[0]} className="imp-removed-row">
              <span><b className="plain">{n.title || "(제목 없음)"}</b><small>{ymd(n.date)} · {preview(n, unitById, 60)}</small></span>
              <button type="button" className="btn sm" onClick={() => move({ s }, "general")}>그래도 저장</button>
            </div>
          ))}
        </section>
      )}

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

    </div>
  );
}

// ───── 요약판 한 칸

function Stat({ tone, icon, label, value, sub, onClick }: { tone: string; icon: string; label: string; value: number; sub: string; onClick: () => void }) {
  return (
    <button type="button" role="listitem" className={"imp-stat " + tone} onClick={onClick}>
      <span className="imp-stat-ic"><Icon name={icon as never} /></span>
      <span className="imp-stat-txt">
        <span className="imp-stat-label">{label}</span>
        <b>{value}</b>
        <small>{sub}</small>
      </span>
    </button>
  );
}

function FoldHead({ open, onToggle, icon, title, count, hint, dest }: { open: boolean; onToggle: () => void; icon: string; title: string; count: number; hint: string; dest?: string }) {
  return (
    <button type="button" className="imp-fold-head" aria-expanded={open} onClick={onToggle} title={hint}>
      <Icon name={open ? "chevD" : "chevR"} />
      <Icon name={icon as never} />
      <b>{title}</b>
      <span className="imp-count">{count}</span>
      {dest && <span className="imp-dest">→ {dest}</span>}
      <span className="imp-fold-cta">{open ? "접기" : "펼치기"}</span>
    </button>
  );
}

// ───── 확인 카드

interface AskProps {
  note: Unassigned;
  unitById: Map<string, GcamUnit>;
  otherOptions: { value: string; label: string }[];
  onTitle: (title: string) => void;
  onPick: (title: string) => void;
  onMove: (to: number | "general") => void;
  onSkip: () => void;
}

function AskCard({ note, unitById, otherOptions, onTitle, onPick, onMove, onSkip }: AskProps) {
  const [show, setShow] = useState(false);
  // 제목이 본문 첫 줄을 자른 것이면 미리보기는 같은 말의 되풀이라 숨긴다
  const head = preview(note, unitById, 70);
  const repeats = head.startsWith(note.title.replace(/…$/, "").slice(0, 20));
  return (
    <article className="imp-ask-card">
      <div className="imp-ask-top">
        <span className="imp-date">{ymd(note.date)}</span>
        <input className="imp-note-title" value={note.title} aria-label="노트 제목" onChange={(e) => onTitle(e.target.value)} />
      </div>
      <button type="button" className="imp-preview" aria-expanded={show} onClick={() => setShow((s) => !s)}>
        {show || repeats ? <span /> : <span>{head}</span>}
        <em>{show ? "접기" : "본문"}</em>
      </button>
      {show && <Body note={note} unitById={unitById} />}
      {note.question && !GENERIC_Q.test(note.question) && <p className="imp-ask-q">{note.question}</p>}
      <div className="imp-choices" role="group" aria-label={`${note.title} 저장할 곳`}>
        {note.candidates.map((c, k) => (
          <button key={c} type="button" className={"imp-choice" + (k === 0 ? " rec" : "")} onClick={() => onPick(c)}>
            {k === 0 && <span className="imp-rec">추천</span>}
            {c}
          </button>
        ))}
        {otherOptions.length > 0 && (
          <select className="imp-choice-select" aria-label="다른 프로젝트 고르기" value="" onChange={(e) => e.target.value && onMove(Number(e.target.value))}>
            <option value="">다른 프로젝트…</option>
            {otherOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        )}
        <button type="button" className="imp-choice ghost" onClick={() => onMove("general")}>일반 활동</button>
        <button type="button" className="imp-choice ghost" onClick={onSkip}>저장 안 함</button>
      </div>
    </article>
  );
}

// ───── 프로젝트 카드

interface CardProps {
  project: DraftProject;
  index: number;
  open: boolean;
  onToggle: () => void;
  myProjects: { id: string; title: string }[];
  unitById: Map<string, GcamUnit>;
  projectOptions: { value: string; label: string }[];
  edit: (fn: (d: Draft, r: Removed[]) => void) => void;
  onMove: (noteIndex: number, to: number | "general") => void;
  onRemove: (noteIndex: number) => void;
  compact?: boolean;
}

function ProjectCard({ project: p, index: pi, open, onToggle, myProjects, unitById, projectOptions, edit, onMove, onRemove, compact }: CardProps) {
  const attached = myProjects.find((m) => m.id === p.existing_project_id);
  const kind = p.origin === "subject" ? { cls: "subject", label: "과목" } : PERSONAL.test(p.title) ? { cls: "personal", label: "개인주제" } : { cls: "team", label: "팀·활동" };
  const when = period(p.notes);
  return (
    <section className={"imp-proj " + kind.cls + (p.notes.length ? "" : " empty") + (compact ? " compact" : "")}>
      <div className="imp-proj-head">
        <button type="button" className="imp-fold" aria-expanded={open} aria-label={`${p.title} 노트 ${open ? "접기" : "펼치기"}`} onClick={onToggle}>
          <Icon name={open ? "chevD" : "chevR"} />
        </button>
        <span className={"imp-origin " + kind.cls}>{kind.label}</span>
        <input
          className="imp-proj-title"
          value={p.title}
          aria-label="프로젝트 이름"
          onChange={(e) => edit((d) => { d.projects[pi].title = e.target.value; })}
          disabled={!!attached}
          title={attached ? "기존 프로젝트에 이어 저장해서 이름은 그대로예요" : undefined}
        />
        <span className="imp-meta">{when && <>{when} · </>}노트 {p.notes.length}</span>
      </div>

      {!open && p.notes.length > 0 && (
        <button type="button" className="imp-peek" onClick={onToggle} aria-label={`${p.title} 노트 펼치기`}>
          {p.notes.slice(0, 3).map((n) => <span key={n.unit_ids[0]}>{n.title}</span>)}
          {p.notes.length > 3 && <em>+{p.notes.length - 3}</em>}
        </button>
      )}

      {!compact && myProjects.length > 0 && (
        <div className="imp-attach">
          <Icon name="move" />
          <select
            aria-label="저장할 곳"
            value={p.existing_project_id ?? ""}
            onChange={(e) => edit((d) => { d.projects[pi].existing_project_id = e.target.value || null; })}
          >
            <option value="">{myProjects.some((m) => m.title.trim() === p.title.trim()) ? "같은 이름의 내 프로젝트에 이어서 저장" : "새 프로젝트로 만들기"}</option>
            {myProjects.map((m) => <option key={m.id} value={m.id}>내 프로젝트에 이어서: {m.title}</option>)}
          </select>
        </div>
      )}

      {open && p.questions.length > 0 && (
        <ul className="imp-questions">
          {p.questions.map((q) => <li key={q}>{q}</li>)}
        </ul>
      )}

      {open && (
        <div className="imp-notes">
          {p.notes.length === 0 && <div className="imp-empty">노트가 없어요. 이대로 두면 이 프로젝트는 만들지 않아요.</div>}
          {p.notes.map((n, i) => (
            <NoteRow
              key={n.unit_ids[0]}
              note={n}
              unitById={unitById}
              onTitle={(title) => edit((d) => { d.projects[pi].notes[i].title = title; })}
              moveOptions={[...projectOptions, { value: "general", label: "일반 활동으로" }]}
              onMove={(to) => onMove(i, to === "general" ? "general" : Number(to))}
              onRemove={() => onRemove(i)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

// ───── 노트 한 줄: 제목 + 본문 첫 줄 미리보기

interface RowProps {
  note: DraftNote;
  unitById: Map<string, GcamUnit>;
  onTitle: (title: string) => void;
  moveOptions: { value: string; label: string }[];
  onMove: (to: string) => void;
  onRemove: () => void;
}

function NoteRow({ note, unitById, onTitle, moveOptions, onMove, onRemove }: RowProps) {
  const [show, setShow] = useState(false);
  return (
    <div className="imp-note">
      <div className="imp-note-main">
        <span className="imp-date">{ymd(note.date)}</span>
        <div className="imp-note-text">
          <input
            className={"imp-note-title" + (note.title.trim() ? "" : " invalid")}
            value={note.title}
            aria-label="노트 제목"
            aria-invalid={!note.title.trim()}
            placeholder="노트 제목을 적어 주세요"
            onChange={(e) => onTitle(e.target.value)}
          />
          <button type="button" className="imp-preview line" aria-expanded={show} onClick={() => setShow((s) => !s)}>
            {show ? null : <span>{preview(note, unitById, 90)}</span>}
            <em>{show ? "접기" : "본문"}</em>
          </button>
        </div>
        <div className="imp-note-actions">
          <select aria-label="다른 곳으로 옮기기" value="" onChange={(e) => e.target.value && onMove(e.target.value)}>
            <option value="">옮기기…</option>
            {moveOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <button type="button" className="icon-btn" aria-label={`${note.title || "노트"} 빼기 (저장 안 함)`} title="빼기 (저장 안 함)" onClick={onRemove}>
            <Icon name="trash" />
          </button>
        </div>
      </div>
      {show && <Body note={note} unitById={unitById} />}
    </div>
  );
}

function Body({ note, unitById }: { note: DraftNote; unitById: Map<string, GcamUnit> }) {
  const body = note.unit_ids.map((id) => unitById.get(id)).filter((u): u is GcamUnit => !!u);
  const uncertain = body.filter((u) => u.uncertain).length;
  return (
    <div className="imp-body">
      {uncertain > 0 && <p className="hint">노란색 부분은 글자 읽기가 확실하지 않은 곳이에요. 저장한 뒤 본문을 고칠 수 있어요.</p>}
      {body.map((u) => <p key={u.id} className={"imp-unit " + u.type + (u.uncertain ? " uncertain" : "")}>{u.text}</p>)}
    </div>
  );
}

/** 본문 첫머리 (제목과 같은 말로 시작하면 그 뒤부터) */
function preview(note: DraftNote, unitById: Map<string, GcamUnit>, max: number): string {
  const text = note.unit_ids
    .map((id) => unitById.get(id))
    .filter((u): u is GcamUnit => !!u && u.type === "body")
    .map((u) => u.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? text.slice(0, max) + "…" : text || "(본문 없음)";
}
