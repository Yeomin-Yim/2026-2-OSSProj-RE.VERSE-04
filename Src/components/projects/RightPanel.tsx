"use client";

import { useState } from "react";
import { saveAnswer } from "@/app/(app)/projects/actions";
import { Icon } from "@/components/ui/Icon";
import { useAction, useToast } from "@/components/ui/Toast";
import { CHECK_LABEL, CHECK_ORDER, type CheckKey } from "@/lib/core/checks.ts";
import { ymd } from "./format";
import type { Checks, Guide, ProjectRow, RecordView, TagInfo } from "./types";

interface Props {
  project: ProjectRow;
  records: RecordView[];
  checks: Checks;
  guides: Guide[];
  projectTags: { code: string; count: number }[];
  tagInfo: TagInfo;
  onEditProject: () => void;
  onAddNote: () => void;
  onShowFiles: () => void;
}

const PLACEHOLDER: Partial<Record<CheckKey, string>> = {
  role: "내가 맡은 일을 한두 문장으로",
  problem: "시작한 계기나 불편",
  process: "시도하고 수정한 과정",
  result: "결과물이나 달라진 점",
  reflection: "배운 점과 다음 개선점",
};

/** 오른쪽 패널: 보완 제안(빈 항목 질문, 최대 2개) + 기록 확인 7항목 + 프로젝트 태그 */
export function RightPanel(props: Props) {
  const { project, records, checks, guides } = props;
  const toast = useToast();
  const { pending, run } = useAction();
  const [answerOpen, setAnswerOpen] = useState<CheckKey | null>(null); // 보완 제안에서 답하는 중인 항목
  const [chipOpen, setChipOpen] = useState<CheckKey | null>(null); // 기록 확인에서 펼친 항목
  const [text, setText] = useState("");

  /** 그 항목에 이미 적어 둔 답(가장 최근 것) */
  const answerOf = (key: CheckKey) => records.find((r) => r.answer_key === key) ?? null;

  function save(key: CheckKey) {
    const value = text.trim();
    if (!value) return toast("내용을 적어 주세요");
    run(
      () => saveAnswer(project.id, key, value, answerOf(key)?.id ?? null),
      () => { setAnswerOpen(null); setChipOpen(null); setText(""); },
    );
  }

  function onGuide(guide: Guide) {
    if (guide.action === "edit") return props.onEditProject();
    if (guide.action === "upload") return props.onAddNote();
    setChipOpen(null);
    setText("");
    setAnswerOpen(guide.key);
  }

  function onChip(key: CheckKey) {
    if (key === "evidence") { setChipOpen(null); return props.onShowFiles(); }
    setAnswerOpen(null);
    setText(answerOf(key)?.raw_text ?? "");
    setChipOpen(chipOpen === key ? null : key);
  }

  return (
    <div className="card panel">
      <div className="right-title">
        <Icon name="bulb" />보완 제안 <span className="badge-ai">규칙</span>
      </div>

      <div id="guides">
        {guides.length === 0 && (
          <div className="all-good"><Icon name="check" />기록이 충분해요. 새 자료를 올리면 다시 확인해요.</div>
        )}
        {guides.map((g) => (
          <div className="guide" key={g.key}>
            <div className="gi"><Icon name={g.action === "upload" ? "file" : "bulb"} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <b>{g.question}</b>
              <p>{g.hint}</p>
              {answerOpen === g.key ? (
                <>
                  <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="짧게 적어도 괜찮아요." />
                  <div className="gbtns">
                    <button className="btn primary sm" disabled={pending} onClick={() => save(g.key)}>
                      {pending ? "저장 중…" : "저장"}
                    </button>
                    <button className="btn sm" onClick={() => setAnswerOpen(null)}>취소</button>
                  </div>
                </>
              ) : (
                <button className="link" onClick={() => onGuide(g)}>{g.cta} <Icon name="chevR" /></button>
              )}
            </div>
          </div>
        ))}
      </div>

      <h2 style={{ margin: "20px 0 10px", fontSize: 13 }}>기록 확인</h2>
      <div className="chips">
        {CHECK_ORDER.map((key) => (
          <button
            key={key}
            type="button"
            className={"chip" + (checks[key] ? " on" : "") + (chipOpen === key ? " open" : "")}
            title={key === "period" ? "기간 보기" : key === "evidence" ? "자료 탭으로" : "눌러서 바로 적기"}
            onClick={() => onChip(key)}
          >
            {checks[key] ? "✓ " : "— "}{CHECK_LABEL[key]}
          </button>
        ))}
      </div>

      {chipOpen === "period" && (
        <div className="chip-edit">
          <b>기간</b>
          <div className="v">
            {project.start_date
              ? `${ymd(project.start_date)} ~ ${project.end_date ? ymd(project.end_date) : "진행 중"}`
              : "아직 기간을 입력하지 않았어요."}
          </div>
          <div className="cbtns">
            <button className="btn sm" onClick={props.onEditProject}>{project.start_date ? "기간 수정" : "기간 입력하기"}</button>
            <button className="btn sm ghost" onClick={() => setChipOpen(null)}>닫기</button>
          </div>
        </div>
      )}

      {chipOpen && chipOpen !== "period" && (
        <div className="chip-edit">
          <b>
            {CHECK_LABEL[chipOpen]}{" "}
            <span className="hint">
              {answerOf(chipOpen) ? `· "${answerOf(chipOpen)!.title}" 자료를 고쳐요` : "· 짧게 적으면 답변 자료로 저장돼요"}
            </span>
          </b>
          <textarea
            autoFocus
            value={text}
            placeholder={PLACEHOLDER[chipOpen]}
            aria-label={CHECK_LABEL[chipOpen]}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return; // 한글 조합 중에는 Enter 를 저장으로 보지 않는다
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); save(chipOpen); }
              else if (e.key === "Escape") setChipOpen(null);
            }}
          />
          <span className="hint">Enter 저장 · Shift+Enter 줄바꿈 · Esc 취소</span>
          <div className="cbtns">
            <button className="btn sm primary" disabled={pending} onClick={() => save(chipOpen)}>
              {pending ? "저장 중…" : "저장"}
            </button>
            <button className="btn sm ghost" onClick={() => setChipOpen(null)}>취소</button>
          </div>
        </div>
      )}

      <h2 style={{ margin: "20px 0 10px", fontSize: 13 }}>프로젝트 태그</h2>
      {props.projectTags.length === 0 && <span className="hint">기록을 저장하면 태그가 붙어요.</span>}
      {props.projectTags.map((t) => (
        <span key={t.code} className={"tag-chip " + (props.tagInfo[t.code]?.group ?? "")}>
          {props.tagInfo[t.code]?.label ?? t.code}<small>{t.count}</small>
        </span>
      ))}
    </div>
  );
}
