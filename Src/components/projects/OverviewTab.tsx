"use client";

import { useState } from "react";
import { generateOverview, saveOverview } from "@/app/(app)/projects/actions";
import { Icon } from "@/components/ui/Icon";
import { useAction } from "@/components/ui/Toast";
import { TodoList } from "@/components/student/StudentData";
import type { AiOverview, Overview, RecordView } from "./types";

const FIELDS: [keyof Overview, string][] = [
  ["role", "역할"], ["activity", "활동"], ["problem", "문제"],
  ["process", "과정"], ["result", "결과"], ["reflection", "회고"],
];

/**
 * 개요 탭: 경험 요소 6항목.
 * AI 로 정리 → 항목마다 근거 문장 확인 → 고쳐서 저장. 저장하면 학생 글(source=student)이 개요가 된다.
 */
export function OverviewTab({ projectId, overview, ai, records }: {
  projectId: string;
  overview: Overview;
  ai: AiOverview | null;
  records: RecordView[];
}) {
  const save = useAction();
  const gen = useAction();
  const [draft, setDraft] = useState(overview);
  // 서버 값이 바뀌면(AI 정리 직후 등) 아직 고치지 않은 화면만 새 값으로 맞춘다
  const [base, setBase] = useState(overview);
  if (base !== overview) {
    setBase(overview);
    if (FIELDS.every(([key]) => draft[key] === base[key])) setDraft(overview);
  }
  const dirty = FIELDS.some(([key]) => draft[key] !== overview[key]);
  // 학생이 아직 저장하지 않아 AI 글이 그대로 보이는 상태: 고치지 않아도 "확인하고 저장"할 수 있다
  const unconfirmed = !!ai && FIELDS.every(([key]) => overview[key] === (ai[key]?.text ?? ""));
  const set = (key: keyof Overview, value: string) => setDraft((d) => ({ ...d, [key]: value }));

  const sentence = new Map(records.flatMap((r) => r.sentences.map((s) => [s.sid, { text: s.text, title: r.title }] as const)));

  return (
    <>
      <div className="sec-head">
        <h3>경험 요소</h3>
        <button className="btn sm" disabled={gen.pending} onClick={() => gen.run(() => generateOverview(projectId))}>
          <Icon name="rewrite" />{gen.pending ? "기록 읽는 중…" : ai ? "AI로 다시 정리" : "AI로 정리하기"}
        </button>
      </div>
      <p className="hint" style={{ margin: "-4px 0 12px" }}>
        AI가 기록 문장을 근거로 정리해요. 근거를 확인하고 고쳐서 저장해 주세요. 기록에 없는 내용은 비워 둬요.
      </p>

      {FIELDS.map(([key, label]) => {
        const sug = ai?.[key];
        return (
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
            {sug?.text && (
              <div className="ai-pick">
                {sug.text !== draft[key] && (
                  <div className="ai-pick-row">
                    <span><span className="badge-ai">AI 정리</span> {sug.text}</span>
                    <button className="btn sm" onClick={() => set(key, sug.text)}>이 글 쓰기</button>
                  </div>
                )}
                <details>
                  <summary>근거 문장 {sug.sids.length}개</summary>
                  <ul className="sent-list">
                    {sug.sids.map((sid) => (
                      <li key={sid}>
                        <span className="sid">{sid}</span>
                        <span>{sentence.get(sid)?.text ?? "(지금은 바뀌었거나 지워진 문장이에요)"}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              </div>
            )}
          </div>
        );
      })}

      <div className="modal-actions">
        {dirty && <button className="btn" onClick={() => setDraft(overview)}>되돌리기</button>}
        <button
          className="btn primary"
          disabled={!(dirty || unconfirmed) || save.pending}
          onClick={() => save.run(() => saveOverview(projectId, draft))}
        >
          {save.pending ? "저장 중…" : "확인하고 저장"}
        </button>
      </div>
      <TodoList todoKey={"project:" + projectId} title="이 프로젝트에서 해야 할 일" />
    </>
  );
}
