"use client";

// 스크랩 · 체크리스트를 한 화면 안의 여러 곳(그래프 패널, 채용공고 목록, 스크랩 카드 …)이 함께 쓰도록 묶는 상태.
// 서버에 저장이 끝난 결과만 화면에 반영한다 (실패하면 알림만 띄우고 화면은 그대로).

import { createContext, useCallback, useContext, useMemo, useRef, useState, useTransition } from "react";
import { changeTodo, removeScrap as removeScrapAction, saveScrapMemo, toggleScrap as toggleScrapAction } from "@/app/(app)/graph/actions";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import type { Scrap, ScrapInput, ScrapType } from "@/lib/server/student/scraps";
import type { Todo } from "@/lib/server/student/todos";

interface Ctx {
  scraps: Scrap[];
  isScrapped: (type: ScrapType, ref: string) => boolean;
  scrapOf: (type: ScrapType, ref: string) => Scrap | undefined;
  toggleScrap: (input: ScrapInput) => Promise<void>;
  removeScrap: (id: string) => Promise<void>;
  saveMemo: (id: string, memo: string) => Promise<boolean>;
  todos: Todo[];
  setTodos: (key: string, list: Todo[]) => void;
  /** 시연 모드: 스크랩·체크리스트를 저장하지 않는다 */
  readOnly: boolean;
}

const StudentCtx = createContext<Ctx | null>(null);
export const useStudent = () => {
  const c = useContext(StudentCtx);
  if (!c) throw new Error("StudentProvider 안에서만 쓸 수 있어요");
  return c;
};

export function StudentProvider({ initialScraps, initialTodos, readOnly = false, children }: {
  initialScraps: Scrap[]; initialTodos: Todo[]; readOnly?: boolean; children: React.ReactNode;
}) {
  const toast = useToast();
  const [scraps, setScraps] = useState(initialScraps);
  const [todos, setAllTodos] = useState(initialTodos);

  const scrapOf = useCallback((type: ScrapType, ref: string) => scraps.find((s) => s.type === type && s.ref_id === ref), [scraps]);

  const value = useMemo<Ctx>(() => ({
    scraps,
    readOnly,
    scrapOf,
    isScrapped: (type, ref) => !!scrapOf(type, ref),
    toggleScrap: async (input) => {
      if (readOnly) { toast("시연 모드에서는 스크랩을 저장하지 않아요"); return; }
      const r = await toggleScrapAction(input);
      toast(r.message || "스크랩하지 못했어요");
      if (!r.ok || !r.data) return;
      const { on, scrap } = r.data;
      setScraps((list) => (on && scrap ? [scrap, ...list.filter((s) => s.id !== scrap.id)] : list.filter((s) => !(s.type === input.type && s.ref_id === input.ref_id))));
    },
    removeScrap: async (id) => {
      const r = await removeScrapAction(id);
      toast(r.message || "해제하지 못했어요");
      if (r.ok) setScraps((list) => list.filter((s) => s.id !== id));
    },
    saveMemo: async (id, memo) => {
      const r = await saveScrapMemo(id, memo);
      if (!r.ok) { toast("메모를 저장하지 못했어요: " + r.message); return false; }
      setScraps((list) => list.map((s) => (s.id === id ? { ...s, memo } : s)));
      return true;
    },
    todos,
    setTodos: (key, list) => setAllTodos((all) => [...all.filter((t) => t.key !== key), ...list]),
  }), [scraps, todos, readOnly, scrapOf, toast]);

  return <StudentCtx.Provider value={value}>{children}</StudentCtx.Provider>;
}

/** 프로토타입 RC.ui.scrapBtn — ★ 토글 */
export function ScrapButton({ input, className }: { input: ScrapInput; className?: string }) {
  const { isScrapped, toggleScrap, readOnly } = useStudent();
  const [pending, start] = useTransition();
  const on = isScrapped(input.type, input.ref_id);
  const label = readOnly ? "시연 모드에서는 스크랩할 수 없어요" : on ? "스크랩 해제" : "스크랩";
  return (
    <button
      type="button"
      className={"scrap-btn" + (on ? " on" : "") + (className ? " " + className : "")}
      aria-pressed={on}
      aria-label={label}
      title={label}
      disabled={pending || readOnly}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); start(() => toggleScrap(input)); }}
    >
      <Icon name="star" />
    </button>
  );
}

/** 프로토타입 RC.ui.todoList — 해야 할 일 체크리스트 (todos 표). 아직 저장한 적 없는 목록은 기본 항목을 보여 준다. */
export function TodoList({ todoKey, defaults = [], title = "해야 할 일" }: { todoKey: string; defaults?: string[]; title?: string }) {
  const { todos, setTodos, readOnly } = useStudent();
  const toast = useToast();
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const busy = useRef(false);
  const saved = todos.filter((t) => t.key === todoKey);
  const virtual = !saved.length;
  const list = virtual ? defaults.map((d, i) => ({ id: "default:" + i, key: todoKey, text: d, done: false, created_at: "" })) : saved;
  const done = list.filter((t) => t.done).length;

  function apply(change: Parameters<typeof changeTodo>[2]) {
    if (readOnly) { toast("시연 모드에서는 체크리스트를 저장하지 않아요"); return; }
    if (busy.current) return;
    busy.current = true;
    start(async () => {
      const r = await changeTodo(todoKey, virtual ? defaults : [], change);
      busy.current = false;
      if (!r.ok || !r.data) { toast("저장하지 못했어요: " + r.message); return; }
      setTodos(todoKey, r.data);
      if (change.op === "add") setText("");
    });
  }

  return (
    <div className="todo" aria-busy={pending}>
      <div className="todo-head"><b>{title}</b><span className="todo-prog">{done} / {list.length}</span></div>
      {list.length ? (
        <ul className="todo-list">
          {list.map((t) => (
            <li key={t.id} className={t.done ? "done" : ""}>
              <label>
                <input type="checkbox" checked={t.done} disabled={readOnly || pending} onChange={() => apply({ op: "toggle", id: t.id })} />
                <span>{t.text}</span>
              </label>
              <button className="icon-btn sm" aria-label="삭제" disabled={readOnly || pending} onClick={() => apply({ op: "remove", id: t.id })}><Icon name="x" /></button>
            </li>
          ))}
        </ul>
      ) : <div className="todo-empty">아직 할 일이 없어요.</div>}
      <div className="todo-add">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing && text.trim()) apply({ op: "add", text }); }}
          placeholder={readOnly ? "시연 모드에서는 저장하지 않아요" : "할 일 추가 후 Enter"}
          maxLength={80}
          aria-label="할 일 추가"
          disabled={readOnly}
        />
        <button className="btn sm" disabled={readOnly || pending || !text.trim()} onClick={() => apply({ op: "add", text })}>추가</button>
      </div>
    </div>
  );
}
