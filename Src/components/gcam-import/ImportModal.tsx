"use client";

// 거캠 회고록 가져오기. 서버 순서는 lib/server/gcam-import/README.md 그대로:
//   ① startImport(파일 이름) → 업로드 주소 → PDF 를 Storage 에 직접 PUT
//   ② stepImport 를 status 가 ready 가 될 때까지 반복 (한 번에 약 30쪽 읽기, 마지막에 묶기 40~50초)
//   ③ 초안 미리보기·수정 (DraftEditor)   ④ confirmImport(id, 고친 초안) → 저장
// 진행률은 서버가 저장한 pages_done / page_count 만 보여 준다 (화면에서 숫자를 지어내지 않는다).
// 가져오기 id 는 이 탭의 sessionStorage 에만 둔다: 새로고침해도 getImport 로 이어서 열기 위해서. 기록 내용은 저장하지 않는다.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { confirmImport, getImport, startImport, stepImport } from "@/app/(app)/projects/importActions";
import type { Draft } from "@/lib/server/gcam-import/draft";
import type { ImportView } from "@/lib/server/gcam-import/import";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { DraftEditor, needsAnswer, type Removed } from "./DraftEditor";

const RESUME_KEY = "reverse.gcam-import-id";
const MAX_BYTES = 30 * 1024 * 1024; // README: 30MB까지
const MAX_PAGES = 120; // import.ts MAX_PAGES

type Phase =
  | { k: "pick" }
  | { k: "resume"; view: ImportView }
  | { k: "uploading"; fileName: string }
  | { k: "reading" }
  | { k: "error"; message: string; canRetry: boolean }
  | { k: "empty" }
  | { k: "review" }
  | { k: "confirm" }
  | { k: "saving" }
  | { k: "done"; message: string };

interface Props {
  myProjects: { id: string; title: string }[];
  onClose: () => void;
}

const storage = {
  get: () => { try { return sessionStorage.getItem(RESUME_KEY); } catch { return null; } },
  set: (id: string) => { try { sessionStorage.setItem(RESUME_KEY, id); } catch { /* 저장 못 해도 진행에는 문제 없음 */ } },
  clear: () => { try { sessionStorage.removeItem(RESUME_KEY); } catch { /* 무시 */ } },
};

export function ImportModal({ myProjects, onClose }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [phase, setPhase] = useState<Phase>({ k: "pick" });
  const [id, setId] = useState<string | null>(null);
  const [view, setView] = useState<ImportView | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [removed, setRemoved] = useState<Removed[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const alive = useRef(true);
  const pumping = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  /** 초안이 준비되면 미리보기로 */
  const toReview = useCallback((v: ImportView) => {
    setView(v);
    if (v.status === "saved") { storage.clear(); setPhase({ k: "error", message: "이미 저장한 가져오기예요. 새 파일로 다시 시작해 주세요.", canRetry: false }); return; }
    if (v.status === "saving") { setPhase({ k: "error", message: "저장하는 중이에요. 잠시 후 다시 확인해 주세요.", canRetry: true }); return; }
    if (!v.draft) { setPhase({ k: "error", message: "초안을 불러오지 못했어요.", canRetry: true }); return; }
    const d = structuredClone(v.draft);
    setDraft(d);
    setRemoved([]);
    setPhase(d.projects.length || d.unassigned.length ? { k: "review" } : { k: "empty" });
  }, []);

  /** ② ready 가 될 때까지 stepImport 반복. 실패하면 멈추고, '다시 시도'에서 이어서 한다 */
  const pump = useCallback(async (importId: string) => {
    if (pumping.current) return;
    pumping.current = true;
    setPhase({ k: "reading" });
    try {
      while (alive.current) {
        const r = await stepImport(importId);
        if (!alive.current) return;
        if (!r.ok) { setPhase({ k: "error", message: r.message, canRetry: true }); return; }
        setView(r.import);
        if (r.import.status !== "reading") { toReview(r.import); return; }
      }
    } catch {
      if (alive.current) setPhase({ k: "error", message: "서버와 연결이 끊겼어요. 다시 시도하면 읽은 곳부터 이어서 해요.", canRetry: true });
    } finally {
      pumping.current = false;
    }
  }, [toReview]);

  // 이 탭에서 하던 가져오기가 있으면 이어서 할지 묻는다
  useEffect(() => {
    const saved = storage.get();
    if (!saved) return;
    getImport(saved)
      .then((r) => {
        if (!alive.current) return;
        if (!r.ok || r.import.status === "saved" || r.import.status === "saving") { storage.clear(); return; }
        setId(saved);
        setView(r.import);
        setPhase({ k: "resume", view: r.import });
      })
      .catch(() => storage.clear());
  }, []);

  // ① 파일 고르기 → 올리기 → 읽기 시작
  async function begin(file: File) {
    setFileError(null);
    if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") return setFileError("PDF 파일만 가져올 수 있어요.");
    if (file.size === 0) return setFileError("빈 파일이에요.");
    if (file.size > MAX_BYTES) return setFileError(`30MB까지 올릴 수 있어요. (이 파일은 ${(file.size / 1024 / 1024).toFixed(1)}MB)`);

    setPhase({ k: "uploading", fileName: file.name });
    try {
      const s = await startImport(file.name);
      if (!alive.current) return;
      if (!s.ok) return setPhase({ k: "error", message: s.message, canRetry: false });
      const put = await fetch(s.uploadUrl, { method: "PUT", body: file, headers: { "content-type": "application/pdf" } });
      if (!alive.current) return;
      if (!put.ok) return setPhase({ k: "error", message: `PDF를 올리지 못했어요 (${put.status}). 다시 시도해 주세요.`, canRetry: false });
      setId(s.id);
      storage.set(s.id);
      setView(null);
      void pump(s.id);
    } catch {
      if (alive.current) setPhase({ k: "error", message: "PDF를 올리지 못했어요. 인터넷 연결을 확인해 주세요.", canRetry: false });
    }
  }

  function restart() {
    storage.clear();
    setId(null);
    setView(null);
    setDraft(null);
    setRemoved([]);
    setSaveError(null);
    setPhase({ k: "pick" });
  }

  // ③ → ④ 저장
  function validate(d: Draft): string | null {
    const notes = [...d.projects.flatMap((p) => p.notes), ...d.unassigned];
    if (!notes.length) return "저장할 노트가 없어요. 뺀 노트를 되돌리거나 취소해 주세요.";
    if (notes.some((n) => !n.title.trim())) return "제목이 빈 노트가 있어요. 제목을 적어 주세요.";
    if (d.projects.some((p) => p.notes.length && !p.existing_project_id && !p.title.trim())) return "이름이 빈 프로젝트가 있어요.";
    return null;
  }

  function askSave() {
    if (!draft) return;
    const problem = validate(draft);
    setSaveError(problem);
    if (problem) return;
    if (draft.unassigned.some(needsAnswer)) setPhase({ k: "confirm" });
    else void save();
  }

  async function save() {
    if (!draft || !id || phase.k === "saving") return;
    setPhase({ k: "saving" });
    setSaveError(null);
    // 노트가 없는 프로젝트는 보내지 않는다 (서버도 만들지 않지만 초안을 깔끔하게)
    const payload: Draft = { ...draft, projects: draft.projects.filter((p) => p.notes.length) };
    try {
      const r = await confirmImport(id, payload);
      if (!alive.current) return;
      if (!r.ok) { setSaveError(r.message); setPhase({ k: "review" }); return; }
      storage.clear();
      setPhase({ k: "done", message: r.message });
      router.refresh();
    } catch {
      if (!alive.current) return;
      setSaveError("저장하지 못했어요. 다시 눌러도 같은 노트가 두 번 생기지 않아요.");
      setPhase({ k: "review" });
    }
  }

  const busy = phase.k === "uploading" || phase.k === "saving";
  const close = () => {
    if (busy) return toast(phase.k === "saving" ? "저장하는 중이에요. 잠시만 기다려 주세요" : "PDF를 올리는 중이에요. 잠시만 기다려 주세요");
    if (phase.k === "reading") toast("닫아도 읽은 쪽은 저장돼요. 다시 열면 이어서 해요");
    onClose();
  };

  const wide = phase.k === "review" || phase.k === "confirm" || phase.k === "saving";
  const counts = draft && {
    projects: draft.projects.filter((p) => p.notes.length).length,
    notes: draft.projects.reduce((s, p) => s + p.notes.length, 0) + draft.unassigned.length,
    unassigned: draft.unassigned.filter(needsAnswer).length,
  };

  return (
    <Modal title="거캠 회고록 가져오기" wide={wide} onClose={close}>
      {(phase.k === "uploading" || phase.k === "reading" || phase.k === "error") && <Steps phase={phase} view={view} uploaded={!!id} />}

      {/* ───── 파일 고르기 */}
      {phase.k === "pick" && (
        <div className="imp-pick">
          <ul className="imp-info">
            <li>거꾸로캠퍼스 <b>&apos;거캐머의 하루&apos;</b>에서 내려받은 <b>PDF</b>를 올려 주세요. ({MAX_PAGES}쪽 · 30MB까지)</li>
            <li>AI(OpenAI)가 PDF의 글자를 읽고 프로젝트별로 묶어요. 30쪽에 약 25초, 마지막 묶기에 40~50초쯤 걸려요.</li>
            <li><b>저장하기 전에</b> 결과를 보고 제목을 고치거나 노트를 다른 프로젝트로 옮길 수 있어요.</li>
            <li>기존 기록은 지우지 않아요. 같은 회고록을 다시 가져와도 노트가 두 번 생기지 않아요.</li>
          </ul>
          <button type="button" className="imp-drop" onClick={() => fileInput.current?.click()}>
            <Icon name="upload" />
            <b>PDF 파일 고르기</b>
            <small>또는 여기로 끌어다 놓기</small>
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".pdf,application/pdf"
            hidden
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void begin(f); }}
          />
          <DropCatcher onFile={(f) => void begin(f)} />
          {fileError && <p className="imp-error" role="alert">{fileError}</p>}
          <div className="modal-actions"><button className="btn" onClick={onClose}>취소</button></div>
        </div>
      )}

      {/* ───── 하던 것 이어서 */}
      {phase.k === "resume" && (
        <div className="imp-pick">
          <div className="imp-resume">
            <Icon name="file" />
            <div>
              <b>{phase.view.file_name}</b>
              <small>
                {phase.view.status === "ready"
                  ? "읽기와 묶기가 끝나 검토를 기다리고 있어요."
                  : phase.view.page_count
                    ? `${phase.view.page_count}쪽 중 ${phase.view.pages_done}쪽까지 읽었어요.`
                    : "읽기를 시작하던 중이었어요."}
              </small>
            </div>
          </div>
          <div className="modal-actions">
            <button className="btn left" onClick={restart}>새 파일로 시작</button>
            <button className="btn" onClick={onClose}>닫기</button>
            <button
              className="btn primary"
              onClick={() => (phase.view.status === "ready" ? toReview(phase.view) : id && void pump(id))}
            >
              이어서 하기
            </button>
          </div>
        </div>
      )}

      {/* ───── 진행 중 · 오류 */}
      {(phase.k === "uploading" || phase.k === "reading") && (
        <p className="imp-wait" role="status">
          {phase.k === "uploading" ? "PDF를 올리고 있어요…" : "창을 닫아도 읽은 쪽은 저장돼요. 다시 열면 이어서 해요."}
        </p>
      )}
      {phase.k === "error" && (
        <>
          <p className="imp-error" role="alert">{phase.message}</p>
          <div className="modal-actions">
            <button className="btn left" onClick={restart}>새 파일로 시작</button>
            <button className="btn" onClick={onClose}>닫기</button>
            {phase.canRetry && id && <button className="btn primary" onClick={() => void pump(id)}>다시 시도</button>}
          </div>
        </>
      )}

      {/* ───── 빈 결과 */}
      {phase.k === "empty" && (
        <>
          <div className="imp-done warn">
            <Icon name="file" />
            <b>가져올 기록을 찾지 못했어요</b>
            <p>&apos;거캐머의 하루&apos;에서 내려받은 PDF가 맞는지 확인해 주세요. 머리글이나 빈 칸만 있는 파일은 가져오지 않아요.</p>
          </div>
          <div className="modal-actions">
            <button className="btn left" onClick={restart}>다른 파일 고르기</button>
            <button className="btn primary" onClick={() => { storage.clear(); onClose(); }}>닫기</button>
          </div>
        </>
      )}

      {/* ───── 미리보기 · 수정 */}
      {(phase.k === "review" || phase.k === "confirm" || phase.k === "saving") && draft && view && counts && (
        <>
          <p className="imp-summary" title={view.file_name}>
            노트 <b>{counts.notes}</b>개를 정리했어요{counts.unassigned ? <> · <b className="warn">{counts.unassigned}</b>개만 골라 주세요</> : null}
          </p>
          <fieldset className="imp-fieldset" disabled={phase.k !== "review"}>
            <DraftEditor
              draft={draft}
              units={view.units}
              myProjects={myProjects}
              removed={removed}
              onChange={(d, r) => { setDraft(d); setRemoved(r); setSaveError(null); }}
            />
          </fieldset>

          <div className="imp-foot">
            {saveError && <p className="imp-error" role="alert">{saveError}</p>}
            {phase.k === "confirm" ? (
              <div className="imp-confirm" role="alertdialog" aria-label="확인 필요 노트">
                <p>
                  아직 고르지 않은 노트 <b>{counts.unassigned}개</b>는 <b>&apos;일반 활동&apos;</b> 프로젝트에 저장돼요. 나중에 옮길 수도 있어요. 이대로 저장할까요?
                </p>
                <div className="modal-actions">
                  <button className="btn" onClick={() => setPhase({ k: "review" })}>돌아가서 고르기</button>
                  <button className="btn primary" onClick={() => void save()}>이대로 저장</button>
                </div>
              </div>
            ) : (
              <div className="modal-actions">
                <button className="btn left" disabled={phase.k === "saving"} onClick={close}>나중에 하기</button>
                <button className="btn primary" disabled={phase.k === "saving"} onClick={askSave}>
                  {phase.k === "saving" ? <><span className="spinner" aria-hidden="true" />저장하는 중…</> : `노트 ${counts.notes}개 저장하기`}
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* ───── 완료 (서버가 성공을 돌려준 뒤에만) */}
      {phase.k === "done" && (
        <>
          <div className="imp-done" role="status">
            <Icon name="check" />
            <b>가져오기를 마쳤어요</b>
            <p>{phase.message}</p>
            <small>프로젝트 연결은 잠시 뒤 다시 계산돼요.</small>
          </div>
          <div className="modal-actions">
            <button className="btn" onClick={() => { onClose(); router.push("/graph"); }}>연결 그래프 보기</button>
            <button className="btn primary" onClick={onClose}>프로젝트 보기</button>
          </div>
        </>
      )}
    </Modal>
  );
}

/** 단계 표시: 올리기 → 글자 읽기(실제 쪽수) → 묶기 → 검토 */
function Steps({ phase, view, uploaded }: { phase: Phase; view: ImportView | null; uploaded: boolean }) {
  const total = view?.page_count ?? null;
  const done = view?.pages_done ?? 0;
  const readAll = total !== null && done >= total;
  const at = phase.k === "uploading" || !uploaded ? 0 : !view || !readAll ? 1 : 2;

  // 묶기는 서버 한 번 호출이라 진행률이 없다: 흐른 시간으로 막대를 채운다 (보통 40~75초, 판단기록 D22). 95%에서 멈춘다
  const grouping = at === 2 && phase.k === "reading";
  const [since, setSince] = useState<number | null>(null);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!grouping) { setSince(null); return; }
    setSince((s) => s ?? Date.now());
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [grouping]);
  const secs = since ? Math.floor((Date.now() - since) / 1000) : 0;
  const groupPct = Math.min(95, Math.round(100 * (1 - Math.exp(-secs / 30))));

  const steps = [
    { label: "PDF 올리기", detail: phase.k === "uploading" ? "올리는 중" : uploaded ? "완료" : "" },
    { label: "글자 읽기", detail: total === null ? (at === 1 ? "쪽수 확인 중" : "") : `${done} / ${total}쪽` },
    { label: "프로젝트로 묶기", detail: at === 2 ? (secs ? `보통 1분 · ${secs}초` : "보통 1분 걸려요") : "" },
    { label: "검토하고 저장", detail: "" },
  ];

  return (
    <div className="imp-steps">
      <ol>
        {steps.map((s, i) => (
          <li key={s.label} className={i < at ? "done" : i === at ? (phase.k === "error" ? "cur err" : "cur") : ""} aria-current={i === at ? "step" : undefined}>
            <span className="n">{i < at ? <Icon name="check" /> : i + 1}</span>
            <span className="t">{s.label}{s.detail && <small>{s.detail}</small>}</span>
            {i === at && phase.k !== "error" && <span className="spinner" aria-hidden="true" />}
          </li>
        ))}
      </ol>
      {grouping ? (
        <div className="imp-bar group" role="progressbar" aria-label="묶는 중" aria-valuemin={0} aria-valuemax={100} aria-valuenow={groupPct}>
          <i style={{ width: `${groupPct}%` }} />
        </div>
      ) : total !== null && at >= 1 && (
        <div className="imp-bar" role="progressbar" aria-label="읽은 쪽" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
          <i style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
        </div>
      )}
    </div>
  );
}

/** 모달 위 아무 곳에나 PDF 를 끌어다 놓을 수 있게 한다 */
function DropCatcher({ onFile }: { onFile: (f: File) => void }) {
  const cb = useRef(onFile);
  useEffect(() => { cb.current = onFile; }, [onFile]);
  useEffect(() => {
    const over = (e: DragEvent) => e.preventDefault();
    const drop = (e: DragEvent) => {
      e.preventDefault();
      const f = e.dataTransfer?.files?.[0];
      if (f) cb.current(f);
    };
    document.addEventListener("dragover", over);
    document.addEventListener("drop", drop);
    return () => {
      document.removeEventListener("dragover", over);
      document.removeEventListener("drop", drop);
    };
  }, []);
  return null;
}
