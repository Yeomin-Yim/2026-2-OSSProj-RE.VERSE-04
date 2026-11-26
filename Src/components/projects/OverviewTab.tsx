"use client";

import { useState } from "react";
import { saveOverview } from "@/app/(app)/projects/actions";
import { useAction } from "@/components/ui/Toast";
import { TodoList } from "@/components/student/StudentData";
import type { Overview } from "./types";

const FIELDS: [keyof Overview, string][] = [
  ["role", "역할"], ["activity", "활동"], ["problem", "문제"],
  ["process", "과정"], ["result", "결과"], ["reflection", "회고"],
];

/** 개요 탭: 경험 요소 6항목을 직접 적고 저장한다. (AI 자동 정리는 아직 연결 전) */
export function OverviewTab({ projectId, overview }: { projectId: string; overview: Overview }) {
  const { pending, run } = useAction();
  const [draft, setDraft] = useState(overview);
  const dirty = FIELDS.some(([key]) => draft[key] !== overview[key]);
  const set = (key: keyof Overview, value: string) => setDraft((d) => ({ ...d, [key]: value }));

  return (
    <>
      <div className="sec-head"><h3>경험 요소</h3></div>
      <p className="hint" style={{ margin: "-4px 0 12px" }}>직접 적고 저장해요. AI 자동 정리는 준비 중이에요.</p>

      {FIELDS.map(([key, label]) => (
        <div className="form-block" key={key}>
          <label>{label}</label>
          {key === "activity" ? (
            <input value={draft[key]} onChange={(e) => set(key, e.target.value)} placeholder="예: 인터뷰 / 지도 제작" />
          ) : (
            <textarea
              rows={2}
              value={draft[key]}
              onChange={(e) => set(key, e.target.value)}
              placeholder="기록에서 확인된 내용이 없어요. 직접 적어도 돼요."
            />
          )}
        </div>
      ))}

      <div className="modal-actions">
        {dirty && <button className="btn" onClick={() => setDraft(overview)}>되돌리기</button>}
        <button
          className="btn primary"
          disabled={!dirty || pending}
          onClick={() => run(() => saveOverview(projectId, draft))}
        >
          {pending ? "저장 중…" : "확인하고 저장"}
        </button>
      </div>
      <TodoList todoKey={"project:" + projectId} title="이 프로젝트에서 해야 할 일" />
    </>
  );
}
