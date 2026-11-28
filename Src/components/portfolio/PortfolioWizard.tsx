"use client";

// 포트폴리오 만들기 3단계 (프로토타입 #/portfolio/1~3)
//   1 유형 선택: 프로젝트 포트폴리오(간단형 · 상세형) / 학교생활기록부 대체서식
//   2 경험 선택: 내 프로젝트(Supabase)와 기록 확인 7항목
//   3 초안 편집: 왼쪽 문서 구성 · 가운데 편집 · 오른쪽 문장 다듬기·증빙·참고 기록 / 대체서식 표 · 미리보기 · 인쇄
//
// 자동 초안 (결정 D005·D006): 학생이 빈 칸이 아니라 채워진 초안을 먼저 본다.
//   새로 담은 프로젝트마다 기존 AI 초안(draftProject, 근거 문장 검증)을 받고, 항목별로 [AI 초안 → 개요 → 기록 원문 발췌] 순서로 채운다.
//   항목마다 출처 배지를 보여 주고, 근거가 없는 항목은 비운 채 "추가 확인 필요"를 보여 준다.
//   학생이 고친 항목("직접 수정함")은 다시 채우기·형식 전환으로 덮어쓰지 않는다.
// 편집 내용은 portfolios 표에 자동 저장되고, 저장 결과(저장 중 / 저장됨 / 저장 실패)를 그대로 보여 준다.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { draftProject, savePortfolio } from "@/app/(app)/portfolio/actions";
import { kindIcon, kindLabel, ymd } from "@/components/projects/format";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { Notice } from "@/components/ui/Notice";
import { Segmented } from "@/components/ui/Segmented";
import { useToast } from "@/components/ui/Toast";
import {
  CHECK_LABEL, CHECK_ORDER, TEMPLATES, altRow, emptyAltRow, emptyProfile, period, promptsFor, templateList, topTags,
  type AltRow, type CheckKey, type PortfolioSource, type ProfileDraft, type ProjectDraft, type TemplateId,
} from "@/lib/core/index.ts";
import type { ProjectRow } from "@/lib/server/projects";
import type { Portfolio } from "@/lib/server/student/portfolio";
import {
  altContent, edit, editedCount, fillMissing, originClass, photoFiles, profileFromRecords, refill, sectionsFor, totalLength, withEvidenceDefaults,
  EVIDENCE_NO, META, ORIGIN_HINT, ORIGIN_LABEL,
  type AiTexts, type ContentMap, type FileInfo, type ProjectContent, type SecKey, type SectionDef, type Variant,
} from "./compose";
import { CoverImage } from "./CoverImage";
import { AltSheet, type AltRowX } from "./Sheets";
import { emptyItems, LandscapeDocument } from "./LandscapeDocument";
import { PrintPortal, waitForPrintAssets } from "./PrintPortal";

export type PickProject = ProjectRow & { checks: Record<CheckKey, boolean>; source: PortfolioSource; files: FileInfo[] };
type Step = 1 | 2 | 3;
type SaveState = "saved" | "saving" | "error";
type Patch = Parameters<typeof savePortfolio>[1];
type Progress = { stage: "save" | "draft" | "error"; targets: string[]; done: string[]; failed: string[]; message?: string };
const PROFILE = "__profile";
const MAX = 1000;
const pad = (n: number) => String(n).padStart(2, "0");
const VARIANT_INFO: Record<Variant, { label: string; pages: string; target: number; desc: string; items: string[] }> = {
  simple: {
    label: "간단형", pages: "프로젝트당 약 1쪽", target: 700,
    desc: "여러 프로젝트를 부담 없이 정리하는 1쪽 사례집",
    items: ["프로젝트 정보 · 대표 이미지 · 한 줄 소개", "문제와 목표", "나의 역할", "실행 과정", "결과와 배움"],
  },
  detailed: {
    label: "상세형", pages: "프로젝트당 약 2~4쪽", target: 1800,
    desc: "진학·면접·발표에서 경험을 깊이 설명하는 2쪽 구성",
    items: ["배경과 문제 정의 · 역할과 기여", "탐구·실행 과정 · 시행착오와 해결", "피드백과 수정 · 결과와 성과", "증빙자료 · 배움과 성장 · 향후 방향"],
  },
};

// content(jsonb)에 형식(_meta)을 같이 담는다. 서버 타입은 3섹션이라 넓혀서 보낸다 (D005)
const pack = (c: ContentMap, v: Variant) => ({ ...c, [META]: { variant: v } }) as unknown as Record<string, ProjectDraft>;
function unpack(raw: Portfolio["content"]): { content: ContentMap; variant: Variant } {
  const { [META]: meta, ...rest } = (raw ?? {}) as Record<string, unknown>;
  const v = (meta as { variant?: string } | undefined)?.variant;
  return { content: rest as ContentMap, variant: v === "detailed" ? "detailed" : "simple" };
}
const priorOf = (c: ProjectContent | undefined): AiTexts => ({ problem: c?.problem, role: c?.role, result: c?.result });

interface Props {
  projects: PickProject[];
  initial: Portfolio;
  initialStep: Step;
  initialType: TemplateId | null;
  userName: string;
}

export function PortfolioWizard({ projects, initial, initialStep, initialType, userName }: Props) {
  const toast = useToast();
  const sources = Object.fromEntries(projects.map((p) => [p.id, p.source]));
  const filesOf = Object.fromEntries(projects.map((p) => [p.id, p.files])) as Record<string, FileInfo[]>;
  const known = (ids: string[]) => ids.filter((id) => sources[id]);
  const start = unpack(initial.content);
  // 새 구성(D015) 전에 만든 초안: 학생 글 보호 원칙상 자동으로 바꾸지 않고, "초안 다시 만들기"를 안내한다
  const [legacy] = useState(() => new Set(Object.entries(start.content).filter(([, c]) => c && (c.problem !== undefined || c.d_problem !== undefined) && c.d_goal === undefined && c.learn === undefined).map(([pid]) => pid)));

  const [id, setId] = useState(initial.id);
  const [type, setType] = useState<TemplateId>(initialType ?? initial.template_id);
  const [variant, setVariantState] = useState<Variant>(start.variant);
  const [order, setOrder] = useState<string[]>(known(initial.project_ids));
  const [selected, setSelected] = useState<string[]>(known(initial.project_ids));
  const [content, setContent] = useState<ContentMap>(start.content);
  const [profile, setProfile] = useState<ProfileDraft | null>(initial.profile);
  const [alt, setAlt] = useState(initial.alt);
  const [built, setBuilt] = useState(!!initial.built_at && known(initial.project_ids).length > 0);
  const [step, setStepState] = useState<Step>(initialStep === 3 && !(initial.built_at && known(initial.project_ids).length) ? 2 : initialStep);
  const [cur, setCur] = useState<string>(known(initial.project_ids)[0] ?? PROFILE);
  const [save, setSave] = useState<SaveState>("saved");
  const [preview, setPreview] = useState(false);
  const [viewRecord, setViewRecord] = useState<{ title: string; text: string } | null>(null);
  const [flash, setFlash] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [drafting, setDrafting] = useState(false);
  // 미리보기에서 잰 쪽 번호 (목차에 쓰고, 인쇄본에도 같은 값을 넘긴다)
  const [pageTotal, setPageTotal] = useState(0);
  const [printing, setPrinting] = useState(false);

  // ───── 주소의 ?step 을 맞춘다 (뒤로 가기 대신 단계 표시를 눌러 이동)
  const setStep = (s: Step) => {
    setStepState(s);
    const u = new URL(window.location.href);
    u.searchParams.set("step", String(s));
    u.searchParams.delete("type");
    window.history.replaceState(null, "", u);
    window.scrollTo(0, 0);
  };

  // ───── 저장: 바뀐 내용을 0.7초 모았다가 portfolios 에 한 번에
  const pending = useRef<Patch>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idRef = useRef(id);
  useEffect(() => { idRef.current = id; }, [id]);
  const flush = useCallback(async () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const patch = pending.current;
    if (!Object.keys(patch).length) return true;
    pending.current = {};
    const r = await savePortfolio(idRef.current, patch);
    if (!r.ok || !r.data) {
      pending.current = { ...patch, ...pending.current };
      setSave("error");
      toast("포트폴리오를 저장하지 못했어요: " + r.message);
      return false;
    }
    idRef.current = r.data.id;
    setId(r.data.id);
    setSave(Object.keys(pending.current).length ? "saving" : "saved");
    return true;
  }, [toast]);
  const queue = useCallback((patch: Patch, now = false) => {
    pending.current = { ...pending.current, ...patch };
    setSave("saving");
    if (timer.current) clearTimeout(timer.current);
    if (now) void flush();
    else timer.current = setTimeout(() => void flush(), 700);
  }, [flush]);
  useEffect(() => () => { if (timer.current) { clearTimeout(timer.current); void flush(); } }, [flush]);

  // 연결 그래프에서 서식을 골라 들어오면 그 서식을 저장
  useEffect(() => { if (initialType && initialType !== initial.template_id) queue({ template_id: initialType }, true); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** 내용 바꾸기 + 저장 예약 */
  const putContent = (next: ContentMap, v: Variant = variant) => { setContent(next); queue({ content: pack(next, v) }); };

  // 예전에 저장한 포트폴리오(3섹션만 있음)를 열거나 형식을 바꾸면, 이 형식에 없는 항목만 기록으로 채워 보여 준다.
  // 보기만 해서는 저장하지 않는다 (학생이 고치면 그때 함께 저장된다).
  useEffect(() => {
    if (TEMPLATES[type].type !== "portfolio") return;
    let changed = false;
    const next = { ...content };
    for (const pid of order) {
      if (!sources[pid]) continue;
      const filled = fillMissing(next[pid], sources[pid], variant, { prior: variant === "detailed" ? priorOf(next[pid]) : null });
      const withEv = withEvidenceDefaults(filled, filesOf[pid] ?? []);
      if (JSON.stringify(withEv) !== JSON.stringify(next[pid])) { next[pid] = withEv; changed = true; }
    }
    if (changed) setContent(next);
  }, [variant, order, type]); // eslint-disable-line react-hooks/exhaustive-deps

  function setVariant(v: Variant) {
    if (v === variant) return;
    setVariantState(v);
    queue({ content: pack(content, v) });
  }

  const tpl = TEMPLATES[type];
  const prof = profile ?? emptyProfile();

  // ───── 1단계
  function step1() {
    const isP = tpl.type === "portfolio";
    return (
      <>
        <h1 className="title">어떤 형태로 정리할까요?</h1>
        <p className="subtitle">고른 형태에 맞춰 RE:Cord가 내 프로젝트 기록으로 초안을 먼저 채워 둬요.</p>
        <div className="type-grid tpl" role="radiogroup">
          {templateList().map((t) => {
            const on = t.id === type;
            const bullets: [string, string][] = t.type === "portfolio"
              ? [["간단형 · 상세형 중 선택", "프로젝트당 약 1~2쪽 / 약 2~4쪽"], ["표지 · 나의 소개 · 목차 · 성장 정리", "A4 세로 프로젝트 사례집, 미리보기 그대로 PDF 저장"], ["기록으로 채운 초안부터 시작", "고치고 싶은 문장만 고쳐요"]]
              : t.bullets ?? [];
            return (
              <button key={t.id} className={"type-card tpl" + (on ? " sel" : "")} role="radio" aria-checked={on}
                onClick={() => { setType(t.id); queue({ template_id: t.id }); }}>
                <span className="radio"><Icon name="check" /></span>
                <h3>{t.name}</h3>
                <div className="d">{t.type === "portfolio" ? "내 프로젝트 기록으로 표지부터 증빙 부록까지 담은 A4 포트폴리오를 만들어요." : t.desc}</div>
                <div className="body"><ul>
                  {bullets.map(([b, s]) => <li key={b}><span className="ck"><Icon name="check" /></span><span><b>{b}</b><small>{s}</small></span></li>)}
                </ul></div>
                {t.type !== "portfolio" && <div className="ref">레퍼런스 · {t.ref}</div>}
              </button>
            );
          })}
        </div>
        {isP && (
          <div className="variant-pick">
            <h2>포트폴리오 분량을 골라 주세요</h2>
            <div className="variant-grid" role="radiogroup" aria-label="포트폴리오 분량">
              {(["simple", "detailed"] as const).map((v) => {
                const info = VARIANT_INFO[v], on = v === variant;
                return (
                  <button key={v} className={"variant-card" + (on ? " sel" : "")} role="radio" aria-checked={on} onClick={() => setVariant(v)}>
                    <span className="radio"><Icon name="check" /></span>
                    <span className="vc-head"><b>{info.label}</b><small>{info.pages}</small></span>
                    <span className="vc-desc">{info.desc}</span>
                    <span className="vc-pages" aria-hidden="true">{v === "simple" ? <i /> : <><i /><i /></>}</span>
                    <ol>{info.items.map((x) => <li key={x}>{x}</li>)}</ol>
                  </button>
                );
              })}
            </div>
            <p className="hint">나중에 편집 화면에서도 바꿀 수 있고, 형식을 바꿔도 이미 쓴 글은 형식별로 그대로 남아요.</p>
          </div>
        )}
        {tpl.notice === "form" && <Notice type="form" />}
        <div className="pf-foot">
          <div className="msg"><svg className="sprout sp" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2.5" /><path d="M8 8h8M8 12h8M8 16h5" /></svg><span><b>진로가 정해지지 않아도 시작할 수 있어요.</b></span></div>
          <button className="btn primary" onClick={() => setStep(2)}>{isP ? `${VARIANT_INFO[variant].label}으로 시작` : "이 서식으로 시작"} <Icon name="arrowR" /></button>
        </div>
      </>
    );
  }

  // ───── AI 초안 (기존 draftProject). 실패하면 이유(문자열)를 돌려준다
  async function aiDraft(pid: string): Promise<AiTexts | string> {
    if (!idRef.current) return "포트폴리오가 아직 저장되지 않았어요";
    const r = await draftProject(idRef.current, pid);
    if (!r.ok) return r.message;
    return { problem: r.data.problem.text, role: r.data.role.text, result: r.data.result.text };
  }

  /** 처음 담는 프로젝트의 초안: 간단형·상세형 둘 다 채운다 (형식을 바꿔도 AI 를 다시 부르지 않게) */
  const firstDraft = (pid: string, ai: AiTexts | null, base?: ProjectContent) =>
    withEvidenceDefaults(refill(refill(base, sources[pid], "simple", { ai }), sources[pid], "detailed", { ai }), filesOf[pid] ?? []);

  // ───── 2단계
  function toggle(pid: string) {
    setSelected((s) => (s.includes(pid) ? s.filter((x) => x !== pid) : [...s, pid]));
  }
  async function build() {
    if (!selected.length) return;
    const nextOrder = [...order.filter((x) => selected.includes(x)), ...selected.filter((x) => !order.includes(x))];
    const isP = TEMPLATES[type].type === "portfolio";
    // 처음 담는 프로젝트만 초안을 새로 만든다. 이미 있는 글(고친 글 포함)은 그대로 둔다.
    const fresh = nextOrder.filter((pid) => !content[pid]);
    const nextContent = { ...content };
    for (const pid of fresh) nextContent[pid] = firstDraft(pid, null);
    // 대체서식: 프로젝트마다 한 행 (활동명·기간 + 활동내용 기본값). 이미 있는 행·쓴 활동내용은 그대로
    const keep = alt.rows.filter((r) => !r.pid || nextOrder.includes(r.pid)) as AltRowX[];
    for (const pid of nextOrder) {
      if (keep.some((r) => r.pid === pid)) continue;
      const row: AltRowX = altRow(sources[pid]);
      const c = altContent(sources[pid], TEMPLATES["altform-dongguk-2027"].contentLimit ?? 100);
      if (c) { row.content = c.text; row.src = c.origin; }
      keep.push(row);
    }
    const rows = [...keep.filter((r) => r.pid || r.name || r.content), ...keep.filter((r) => !(r.pid || r.name || r.content))];
    while (rows.length < (TEMPLATES["altform-dongguk-2027"].minRows ?? 5)) rows.push(emptyAltRow());
    const nextAlt = { ...alt, rows: rows.slice(0, TEMPLATES["altform-dongguk-2027"].maxRows ?? 10) as AltRow[] };
    const nextProfile = profile ?? { ...emptyProfile(), skills: topTags(nextOrder.map((p) => sources[p])).join(", "), ...profileFromRecords(nextOrder.map((p) => sources[p]), nextContent, variant) };
    setOrder(nextOrder); setContent(nextContent); setAlt(nextAlt); setProfile(nextProfile); setBuilt(true);
    setCur(nextOrder.includes(cur) ? cur : nextOrder[0]);
    queue({ template_id: type, project_ids: nextOrder, content: pack(nextContent, variant), alt: nextAlt, profile: nextProfile, built_at: new Date().toISOString() });

    const aiTargets = isP ? fresh : [];
    setProgress({ stage: "save", targets: aiTargets, done: [], failed: [] });
    if (!(await flush())) {
      setProgress({ stage: "error", targets: [], done: [], failed: [], message: "포트폴리오를 저장하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요." });
      return;
    }
    if (aiTargets.length) {
      setProgress({ stage: "draft", targets: aiTargets, done: [], failed: [] });
      const results = await Promise.all(aiTargets.map(async (pid) => {
        const r = await aiDraft(pid);
        setProgress((p) => p && ({ ...p, done: [...p.done, pid], failed: typeof r === "string" ? [...p.failed, pid] : p.failed }));
        return r;
      }));
      const merged = { ...nextContent };
      aiTargets.forEach((pid, i) => { const r = results[i]; if (typeof r !== "string") merged[pid] = firstDraft(pid, r, merged[pid]); });
      const err = results.find((r): r is string => typeof r === "string");
      putContent(merged);
      toast(err ? `AI 초안을 받지 못한 프로젝트는 개요·기록 문장으로 채웠어요 (${err})` : "초안을 준비했어요 · 기록과 다른 곳이 없는지 확인해 주세요");
    } else {
      toast(isP ? "편집을 시작해요 · 이미 쓴 글은 그대로 두었어요" : "활동명·기간·활동내용 초안을 채웠어요");
    }
    setProgress(null);
    setStep(3);
  }
  function step2() {
    return (
      <>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 8 }}>
          <div>
            <h1 className="title">담을 프로젝트를 선택해 주세요.</h1>
            <p className="subtitle">기록에서 확인된 항목을 보고 골라요.{tpl.type === "portfolio" && <> · <b>{VARIANT_INFO[variant].label}</b> ({VARIANT_INFO[variant].pages})</>}</p>
          </div>
          <div className="legend-chips"><span className="chip on">✓ 기록 있음</span><span className="chip">— 미확인</span></div>
        </div>
        {projects.length ? projects.map((p) => {
          const on = selected.includes(p.id);
          return (
            <div key={p.id} className={"pick" + (on ? " sel" : "")} role="checkbox" aria-checked={on} tabIndex={0}
              onClick={() => toggle(p.id)} onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); toggle(p.id); } }}>
              <span className="cb">{on && <Icon name="check" />}</span>
              <div style={{ flex: 1 }}>
                <b>{p.title}</b>
                <div className="pp">{period(p)} · 자료 {p.record_count}개{content[p.id] ? " · 이미 쓴 초안이 있어요" : ""}</div>
                <div className="chips">
                  {CHECK_ORDER.map((k) => <span key={k} className={"chip" + (p.checks[k] ? " on" : "")}>{p.checks[k] ? "✓ " : "— "}{CHECK_LABEL[k]}</span>)}
                </div>
              </div>
            </div>
          );
        }) : (
          <div className="card panel empty-note" style={{ marginTop: 16 }}>
            프로젝트가 없어요. 먼저 프로젝트를 만들어 주세요.<br />
            <Link className="btn sm primary" href="/projects" style={{ marginTop: 10 }}>프로젝트 관리로 가기</Link>
          </div>
        )}
        <div className="pf-foot">
          <div className="msg"><span><b>{selected.length}개 선택</b><small>{tpl.type === "altform" ? "활동명·기간과 활동내용 초안을 프로젝트 기록에서 가져와요." : "RE:Cord가 기록을 바탕으로 초안을 먼저 채워 둬요. 기록에 없는 내용은 쓰지 않아요."}</small></span></div>
          <button className="btn primary" disabled={!selected.length || save === "saving" || !!progress} onClick={build}>
            {progress ? <><span className="spinner" />준비하는 중…</> : tpl.type === "altform" ? <><Icon name="pen" />초안 채우고 편집 시작</> : <><Icon name="sparkle" />초안 만들기</>}
          </button>
        </div>
      </>
    );
  }

  // ───── 초안 준비 화면 (실제 단계와 실제 완료 수만 보여 준다 · 가짜 진행률 없음, D008)
  function progressOverlay() {
    if (!progress) return null;
    const names = order.filter((pid) => sources[pid]);
    const err = progress.stage === "error";
    return (
      <div className="build-overlay" role="dialog" aria-modal="true" aria-labelledby="build-title">
        <div className="build-card" aria-live="polite">
          {err ? <div className="build-err"><Icon name="info" /></div> : <div className="rc-loader" aria-hidden="true"><i /><i /><i /></div>}
          <h2 id="build-title">{err ? "잠시 문제가 생겼어요" : progress.stage === "save" ? "프로젝트 기록을 확인하고 있어요." : "포트폴리오 초안을 준비하고 있어요."}</h2>
          <p>
            {err ? progress.message
              : progress.stage === "save" ? `선택한 ${names.length}개 프로젝트를 담고 있어요.`
              : `기록 문장을 근거로 초안을 쓰고 있어요 · ${progress.done.length}/${progress.targets.length}개 프로젝트 완료`}
          </p>
          {progress.stage === "draft" && (
            <ul className="build-list">
              {names.map((pid) => {
                const target = progress.targets.includes(pid);
                const done = progress.done.includes(pid), failed = progress.failed.includes(pid);
                return (
                  <li key={pid} className={done ? (failed ? "fail" : "done") : target ? "wait" : "keep"}>
                    <span className="bl-ico">{done ? (failed ? "!" : <Icon name="check" />) : target ? <span className="spinner" /> : "–"}</span>
                    <span className="bl-t">{sources[pid].title}</span>
                    <small>{done ? (failed ? "개요·기록 문장으로 채움" : "초안 완료") : target ? "초안 쓰는 중" : "이미 쓴 글 유지"}</small>
                  </li>
                );
              })}
            </ul>
          )}
          {err && (
            <div className="modal-actions" style={{ justifyContent: "center" }}>
              <button className="btn" onClick={() => setProgress(null)}>닫기</button>
              <button className="btn primary" onClick={() => { setProgress(null); void build(); }}><Icon name="refresh" />다시 시도</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ───── 3단계 (프로젝트 포트폴리오)
  function setSec(pid: string, k: SecKey, v: string) {
    putContent({ ...content, [pid]: edit(content[pid], k, v.slice(0, MAX)) });
  }
  function setField(pid: string, patch: Partial<ProjectContent>) {
    putContent({ ...content, [pid]: { ...(content[pid] ?? {}), ...patch } });
  }
  function setProf(k: keyof ProfileDraft, v: string) {
    const next = { ...prof, [k]: v };
    setProfile(next); queue({ profile: next });
  }
  function move(d: number) {
    const i = order.indexOf(cur), j = i + d;
    if (i < 0 || j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    setOrder(next); queue({ project_ids: next });
    setFlash(true); setTimeout(() => setFlash(false), 900);
    toast(`${pad(i + 1)} → ${pad(j + 1)}번으로 옮겼어요`);
  }
  /** AI 초안 다시 만들기 (학생이 누를 때만). 직접 고친 항목은 그대로 둔다 */
  async function redraft(pid: string) {
    const c = content[pid], n = editedCount(c, variant);
    const msg = n
      ? `직접 고친 ${n}개 항목은 그대로 두고, 나머지 항목만 새 초안으로 바꿀까요?`
      : "지금 초안을 새 초안으로 바꿀까요? (AI 초안 → 개요 → 기록 발췌 순서로 다시 채워요)";
    if (!window.confirm(msg)) return;
    setDrafting(true);
    const r = await aiDraft(pid);
    setDrafting(false);
    const ai = typeof r === "string" ? null : r;
    putContent({ ...content, [pid]: refill(c, sources[pid], variant, { ai, prior: variant === "detailed" ? priorOf(c) : null }) });
    toast(ai ? "새 초안으로 바꿨어요 · 기록과 다른 곳이 없는지 확인해 주세요" : `AI 초안을 받지 못해 개요·기록 문장으로 다시 채웠어요 (${r})`);
  }
  /** 항목 하나를 기록(개요·원문 발췌)으로 다시 채우기 */
  function refillSec(pid: string, sec: SectionDef) {
    const c = content[pid];
    if ((c?.[sec.key] ?? "").trim() && !window.confirm(`"${sec.label}"의 지금 글을 기록에서 다시 채운 글로 바꿀까요?`)) return;
    const next = refill(c, sources[pid], variant, { keys: [sec.key], force: true, prior: variant === "detailed" ? priorOf(c) : null });
    if (!(next[sec.key] ?? "").trim()) { toast("기록에서 이 항목의 근거를 찾지 못했어요. 프로젝트 관리에서 기록을 보완해 주세요."); return; }
    putContent({ ...content, [pid]: next });
    toast(`${ORIGIN_LABEL[next._src?.[sec.key] ?? "record"]} · 읽어 보고 다듬어 주세요`);
  }
  const saveBadge = (
    <span className="save-state" role="status">
      {save === "saving" ? <><Icon name="refresh" /> 저장 중…</> : save === "error" ? <><Icon name="info" /> 저장 실패</> : <><Icon name="check" /> 저장됨</>}
    </span>
  );
  function prompts(keys: [TemplateId, PortfolioSource[]][], live = false) {
    return (
      <details className="prompt-box">
        <summary>{live ? "프롬프트 보기 · AI 초안(문제·역할·결과)에 쓰는 지시문" : "프롬프트 보기 · AI 를 연결하면 보낼 지시문 (지금은 AI 미연결)"}</summary>
        {keys.flatMap(([t, ps]) => Object.values(promptsFor(t, ps)).map((txt, i) => <pre key={t + i}>{txt}</pre>))}
      </details>
    );
  }

  function orderList() {
    const isP = cur === PROFILE;
    return (
      <div className="card panel">
        <h2 style={{ fontSize: 13, marginBottom: 12 }}>문서 구성</h2>
        <button className={"ord-item" + (isP ? " sel" : "")} onClick={() => setCur(PROFILE)}><span className="no">P</span>표지 · 나의 소개{isP && <small>현재 편집 중</small>}</button>
        {order.map((pid, i) => (
          <button key={pid} className={"ord-item" + (pid === cur ? " sel" : "")} onClick={() => setCur(pid)}>
            <span className="no">{pad(i + 1)}</span>{sources[pid].title}{pid === cur && <small>현재 편집 중</small>}
          </button>
        ))}
        <div className="ord-btns">
          <button className="btn" onClick={() => move(-1)} disabled={isP || order.indexOf(cur) === 0}><Icon name="up" /> 위로</button>
          <button className="btn" onClick={() => move(1)} disabled={isP || order.indexOf(cur) === order.length - 1}><Icon name="down" /> 아래로</button>
        </div>
        <button className="btn sm block" onClick={() => setStep(2)}>프로젝트 다시 고르기</button>
        <div className="ord-note">A4 가로 · {variant === "simple" ? "표지(짧은 소개) → 프로젝트 목록 → 프로젝트당 1쪽 → 성장 요약" : "표지 → 학생 소개 → 목차 → 프로젝트 사례(내용에 따라 1~4쪽) → 종합 성장 분석 → 주요 증빙자료"} 순서로 만들어져요.</div>
      </div>
    );
  }

  // 표지·나의 소개·성장 정리 쪽에 들어가는 값. 라벨은 문서 구성에 맞춰 화면에서 바꿔 보여 준다 (서식 정의는 그대로)
  const PROFILE_UI: { k: keyof ProfileDraft; label: string; guide: string; ph: string; rows?: number; limit?: number }[] = [
    { k: "slogan", label: "표지 한 줄 소개", guide: "표지 이름 위에 들어가요. 나를 한 구절로 소개해요.", ph: "예: 관찰에서 출발해 근거로 개선하는 학생", limit: 40 },
    { k: "education", label: "학력", guide: "표지와 나의 소개에 들어가요.", ph: "예: OO고등학교 재학 (2024.03 ~ )" },
    { k: "skills", label: "관심 분야 · 키워드", guide: "내 기록에서 많이 나온 키워드로 채웠어요. 쉼표로 나눠요.", ph: "예: 설문 조사, 데이터 분석", limit: 120 },
    { k: "motivation", label: "나의 소개 (관심 분야와 탐구 주제)", guide: "어떤 문제에 관심을 갖고 프로젝트를 해 왔는지 적어요. 나의 소개 쪽 첫 글이에요.", ph: "기록에서 채우기를 누르면 각 프로젝트의 시작 계기 문장을 가져와요.", rows: 6, limit: 1000 },
    { k: "aspiration", label: "앞으로의 학습 · 진로 방향", guide: "성장과 역량 정리 쪽 마지막에 들어가요.", ph: "기록에서 채우기를 누르면 기록의 '다음에·앞으로' 문장을 가져와요.", rows: 5, limit: 1000 },
    { k: "awards", label: "수상 · 자격 (직접 입력)", guide: "기록에 없는 항목은 비워 두세요.", ph: "한 줄에 하나씩", rows: 3, limit: 500 },
    { k: "link", label: "포트폴리오 · SNS 링크", guide: "", ph: "예: https://…" },
  ];
  function fillProfile(k: "motivation" | "aspiration") {
    const v = profileFromRecords(order.map((p) => sources[p]).filter(Boolean), content, variant)[k];
    if (!v) return toast("기록에서 가져올 문장을 찾지 못했어요. 직접 적어 주세요.");
    if (prof[k].trim() && !window.confirm("지금 쓴 글을 기록에서 가져온 문장으로 바꿀까요?")) return;
    setProf(k, v);
    toast("기록 원문 문장을 그대로 가져왔어요 · 내 말로 다듬어 주세요");
  }
  function profileEditor() {
    return (
      <div className="card panel resume">
        <h3 className="edit-title">표지 · 나의 소개</h3>
        <div className="edit-meta">표지, 나의 소개, 성장과 역량 정리 쪽에 들어가요.</div>
        <div className="notice notice-noai" role="note"><Icon name="info" /><span>관심 키워드는 내 기록에서 많이 나온 것으로 채웠어요. 나의 소개·앞으로의 방향은 기록 원문 문장을 가져올 수 있고, 내 말로 고쳐 쓰면 돼요.</span></div>
        {PROFILE_UI.map(({ k, label, guide, ph, rows, limit }) => {
          const v = prof[k] ?? "";
          return (
            <div key={k} className="sec">
              <h4 className="sec-h">{label}
                {k === "skills" && <span className="origin-badge record">기록 키워드에서 가져옴</span>}
                {(k === "motivation" || k === "aspiration") && <button className="btn ghost sec-refill" onClick={() => fillProfile(k)}>기록에서 채우기</button>}
              </h4>
              {guide && <div className="g">{guide}</div>}
              <div className="ta">
                {rows ? (
                  <>
                    <textarea rows={rows} value={v} maxLength={limit} placeholder={ph} onChange={(e) => setProf(k, e.target.value)} />
                    {limit && <span className="cnt">{v.length} / {limit}</span>}
                  </>
                ) : <input value={v} maxLength={limit} placeholder={ph} onChange={(e) => setProf(k, e.target.value)} />}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  /** 항목 하나: 제목 · 출처 배지 · 다시 채우기 · 안내 · 입력칸 · 분량 · (비었으면) 추가 확인 필요 */
  function sectionEditor(pid: string, sec: SectionDef) {
    const c = content[pid], v = c?.[sec.key] ?? "", origin = c?._src?.[sec.key];
    const over = v.length > sec.soft;
    const common = {
      value: v,
      maxLength: MAX,
      placeholder: "짧게 직접 적어 보세요.",
      "aria-label": sec.label,
    };
    return (
      <div key={sec.key} className={"sec" + (v.trim() ? "" : " need")}>
        <h4 className="sec-h">
          {sec.no ? <span className="sec-no">{sec.no}</span> : <span className="sec-no sub" aria-hidden="true">·</span>}{sec.label}
          {origin ? <span className={"origin-badge " + originClass(origin)} title={ORIGIN_HINT[origin]}>{ORIGIN_LABEL[origin]}</span>
            : v.trim() ? <span className="origin-badge saved" title="이전에 저장한 글이에요.">저장된 글</span>
            : <span className="origin-badge need">추가 확인 필요</span>}
          <button className="btn ghost sec-refill" onClick={() => refillSec(pid, sec)} title="개요·기록 원문에서 이 항목을 다시 채워요">기록에서 다시 채우기</button>
        </h4>
        <div className="g">{sec.guide}</div>
        <div className="ta">
          {sec.single
            ? <input {...common} onChange={(e) => setSec(pid, sec.key, e.target.value)} />
            : <textarea {...common} rows={sec.rows} onChange={(e) => setSec(pid, sec.key, e.target.value)} />}
          <span className={"cnt" + (over ? " soft-over" : "")}>{v.length} / 권장 {sec.soft}자</span>
        </div>
        {!v.trim() && (
          <div className="need-box">
            <Icon name="info" />
            <span>기록에서 이 항목의 근거를 찾지 못해 비워 두었어요. <b>추가 확인이 필요해요.</b> 짧게 직접 적거나, <Link href={`/projects/${pid}`}>프로젝트 관리</Link>에서 관련 기록을 더해 주세요.</span>
          </div>
        )}
      </div>
    );
  }

  /** 증빙자료 고르기 (상세형 7번 · 간단형 오른쪽) */
  function evidencePicker(pid: string, compact = false) {
    const files = filesOf[pid] ?? [], chosen = content[pid]?.evidence ?? [];
    const toggleEv = (fid: string) => setField(pid, { evidence: chosen.includes(fid) ? chosen.filter((x) => x !== fid) : [...chosen, fid] });
    if (!files.length) return <div className="hint">이 프로젝트에 자료가 없어요. <Link href={`/projects/${pid}`}>프로젝트 관리</Link>에서 사진·문서·링크를 올려 주세요.</div>;
    return (
      <div className={"ev-list" + (compact ? " compact" : "")}>
        {files.map((f) => {
          const on = chosen.includes(f.id);
          return (
            <label key={f.id} className={"ev-row" + (on ? " on" : "")}>
              <input type="checkbox" checked={on} onChange={() => toggleEv(f.id)} />
              <span className="ev-ico"><Icon name={kindIcon(f.kind)} /></span>
              <span className="ev-t"><b>{f.title}</b><small>{kindLabel(f.kind)} · {ymd(f.recorded_at)}{f.is_result ? " · 결과물" : ""}{f.has_file ? " · 원본 파일" : f.url ? " · 링크" : ""}</small></span>
              <button type="button" className="icon-btn" aria-label={`${f.title} 내용 보기`} onClick={(e) => { e.preventDefault(); const r = sources[pid].records.find((x) => x.id === f.id); setViewRecord({ title: f.title, text: r?.text ?? "" }); }}><Icon name="eye" /></button>
            </label>
          );
        })}
        <p className="hint" style={{ margin: "6px 0 0" }}>{chosen.length}개 선택 · 미리보기의 증빙자료 목록에 들어가요. 원본은 제출할 때 따로 첨부해요.</p>
      </div>
    );
  }

  /** 간단형 1번: 프로젝트 정보 (이름·기간은 프로젝트에서, 대표 이미지는 사진 자료에서) */
  function infoBlock(pid: string) {
    const s = sources[pid], photos = photoFiles(filesOf[pid] ?? []), cover = content[pid]?.cover ?? "";
    return (
      <div className="sec info-sec">
        <h4 className="sec-h"><span className="sec-no">1</span>프로젝트 정보<span className="origin-badge info" title={ORIGIN_HINT.info}>프로젝트 정보</span></h4>
        <div className="info-grid">
          <div className="cover-box">
            {cover ? <CoverImage recordId={cover} alt={`${s.title} 대표 이미지`} className="cover-img" /> : <div className="cover-img cover-ph">{photos.length ? "대표 이미지 없음" : "사진 자료가 없어요"}</div>}
            {photos.length > 0 ? (
              <select value={cover} onChange={(e) => setField(pid, { cover: e.target.value })} aria-label="대표 이미지 고르기">
                <option value="">대표 이미지 쓰지 않기</option>
                {photos.map((f) => <option key={f.id} value={f.id}>{f.title}</option>)}
              </select>
            ) : <small className="hint">프로젝트 관리에서 사진을 올리면 대표 이미지로 쓸 수 있어요.</small>}
          </div>
          <dl className="info-dl">
            <dt>프로젝트명</dt><dd>{s.title}</dd>
            <dt>활동 기간</dt><dd>{period(s)}</dd>
            <dd className="hint" style={{ gridColumn: "1/-1" }}>이름·기간은 <Link href={`/projects/${pid}`}>프로젝트 관리</Link>에서 고치면 여기에도 반영돼요.</dd>
          </dl>
        </div>
      </div>
    );
  }

  function step3Project() {
    const head = (
      <div className="page-head">
        <div><h1 className="title">프로젝트 포트폴리오</h1><p className="subtitle">RE:Cord가 채운 초안을 읽고, 내 말로 고친 뒤 미리보기로 확인하세요.</p></div>
        <div className="head-tools">
          <Segmented label="포트폴리오 분량" value={variant} onChange={setVariant}
            options={[{ value: "simple", label: "간단형" }, { value: "detailed", label: "상세형" }]} />
          {saveBadge}
          <button className="btn primary" onClick={() => setPreview(true)}><Icon name="eye" /> 미리보기</button>
        </div>
      </div>
    );
    if (cur === PROFILE || !sources[cur]) {
      return (
        <>
          {head}
          <div className="draft-grid">
            {orderList()}
            {profileEditor()}
            <div className="col-right"><div className="card panel">
              <div className="right-title" style={{ color: "var(--text)" }}><Icon name="info" /> 문서 구성 (A4 가로 · {VARIANT_INFO[variant].label})</div>
              {variant === "simple" ? (
                <ol className="hint" style={{ margin: "6px 0 0", paddingLeft: 18, lineHeight: 1.8 }}>
                  <li>표지 — 한 줄 소개 · 이름 · 짧은 소개(나의 소개 앞 두 문장) · 관심 분야</li>
                  <li>프로젝트 목록 — 한 줄 소개 · 역할 · 쪽</li>
                  <li>프로젝트당 1쪽 — 개요·역할·과정 | 대표 결과물·성과·배운 점</li>
                  <li>성장 요약 — 반복된 키워드 · 배운 점</li>
                </ol>
              ) : (
                <ol className="hint" style={{ margin: "6px 0 0", paddingLeft: 18, lineHeight: 1.8 }}>
                  <li>표지 — 한 줄 소개 · 이름 · 관심 분야 · 대표 이미지</li>
                  <li>학생 소개 — 나의 소개 · 탐구 주제 · 대표 역량</li>
                  <li>프로젝트 목차 — 기간 · 분야 · 나의 역할 · 쪽</li>
                  <li>프로젝트 사례 — OVERVIEW / RESEARCH &amp; PROCESS / OUTCOME &amp; REFLECTION</li>
                  <li>종합 성장 분석 — 키워드 · 성찰 · 앞으로의 방향</li>
                  <li>주요 증빙자료 — 사진 · 문서 · 링크</li>
                </ol>
              )}
            </div></div>
          </div>
        </>
      );
    }
    const s = sources[cur], c = content[cur], pos = order.indexOf(cur);
    const secs = sectionsFor(variant), info = VARIANT_INFO[variant];
    const len = totalLength(c, variant), empty = secs.filter((x) => !(c?.[x.key] ?? "").trim()).length;
    const pageNo = variant === "simple" ? `${pos + 2}쪽` : `${pos * 2 + 2}–${pos * 2 + 3}쪽`;
    return (
      <>
        {head}
        <div className="draft-grid">
          {orderList()}
          <div className={"card panel edit-card" + (flash ? " flash" : "")}>
            <h3 className="edit-title"><span className="ord-no">{pad(pos + 1)}</span>{s.title}</h3>
            <div className="edit-meta">{period(s)} · <b className="ord-pos">{info.label} · 포트폴리오 {pageNo} · {pos + 1}/{order.length}번째 프로젝트</b></div>
            <div className="draft-banner" role="note">
              <Icon name="sparkle" />
              <div>
                <b>기존 프로젝트 기록을 바탕으로 초안을 준비했어요. 내용을 확인하고 자유롭게 수정해 보세요.</b>
              </div>
            </div>
            {legacy.has(cur) && (
              <div className="need-box" style={{ marginBottom: 8 }}>
                <span><b>예전에 만든 초안이에요.</b> 지금 구성(상세형 목표·의사결정, 간단형 배운 점 등)으로 기록을 더 활용하려면 <b>초안 다시 만들기</b>를 눌러 주세요. 직접 고친 항목은 그대로 둬요.</span>
              </div>
            )}
            <div className="draft-tools">
              <span className={"len-meter" + (len > info.target ? " over" : "")}>
                지금 약 {len.toLocaleString()}자 · {info.pages} 권장 {info.target.toLocaleString()}자 안팎{empty ? ` · 추가 확인 필요 ${empty}개` : ""}
              </span>
              <button className="btn sm" disabled={drafting} onClick={() => redraft(cur)}>
                {drafting ? <><span className="spinner" />새 초안을 쓰는 중…</> : <><Icon name="sparkle" />초안 다시 만들기</>}
              </button>
            </div>
            {variant === "simple" && infoBlock(cur)}
            {secs.map((sec) => (
              <div key={sec.key}>
                {sectionEditor(cur, sec)}
                {variant === "detailed" && sec.key === "d_result" && (
                  <div className="sec">
                    <h4 className="sec-h"><span className="sec-no">{EVIDENCE_NO}</span>사진·문서·링크 등 증빙자료<span className="origin-badge info">내 자료에서 선택</span></h4>
                    <div className="g">이 프로젝트에 올린 자료 중 포트폴리오에 증빙으로 소개할 것을 골라요.</div>
                    {evidencePicker(cur)}
                  </div>
                )}
              </div>
            ))}
            {prompts([["portfolio-project", [s]]], true)}
          </div>
          <div className="col-right"><div className="card panel">
            {variant === "simple" && (
              <>
                <h2 style={{ margin: "0 0 4px", fontSize: 13 }}>핵심 증빙자료</h2>
                {evidencePicker(cur, true)}
              </>
            )}
            <h2 style={{ margin: variant === "simple" ? "16px 0 4px" : "0 0 4px", fontSize: 13 }}>참고할 기록</h2>
            {s.records.length ? s.records.slice(0, 8).map((r) => (
              <button key={r.id} className="ref-row" onClick={() => setViewRecord({ title: r.title, text: r.text })}>
                <span className="ico"><Icon name="file" /></span>{r.title}<Icon name="chevR" />
              </button>
            )) : <div className="hint">참고할 기록이 없어요.</div>}
            <Link className="btn sm block" href={`/projects/${cur}`} style={{ marginTop: 10 }}>프로젝트 관리에서 보기</Link>
          </div></div>
        </div>
      </>
    );
  }

  // ───── 3단계 (대체서식)
  function setAltNext(next: typeof alt) { setAlt(next); queue({ alt: next }); }
  const altLimit = TEMPLATES["altform-dongguk-2027"].contentLimit ?? 100;
  /** 활동내용이 빈 행을 프로젝트 개요·기록으로 채운다 (학생이 누를 때만, 쓴 칸은 그대로) */
  function fillAlt(only?: number) {
    let n = 0;
    const rows = (alt.rows as AltRowX[]).map((r, i) => {
      if ((only !== undefined && i !== only) || r.content.trim() || !r.pid || !sources[r.pid]) return r;
      const c = altContent(sources[r.pid], altLimit);
      if (!c) return r;
      n++;
      return { ...r, content: c.text, src: c.origin };
    });
    if (!n) return toast("채울 수 있는 빈 활동내용이 없어요. 프로젝트 개요나 기록을 먼저 보완해 주세요.");
    setAltNext({ ...alt, rows: rows as AltRow[] });
    toast(`${n}개 행의 활동내용을 채웠어요 · 기관명 없이 객관적 사실만 남았는지 확인해 주세요`);
  }
  function step3Alt() {
    const t = TEMPLATES["altform-dongguk-2027"];
    const rows = alt.rows as AltRowX[];
    const fillable = rows.some((r) => r.pid && sources[r.pid] && !r.content.trim());
    return (
      <>
        <div className="page-head">
          <div><h1 className="title">{t.name}</h1><p className="subtitle">동국대학교 2027학년도 수시모집 서식 디자인 그대로 · 칸에 바로 입력하고 미리보기로 인쇄해요.</p></div>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>{saveBadge}<button className="btn primary" onClick={() => setPreview(true)}><Icon name="eye" /> 미리보기 / 인쇄</button></div>
        </div>
        <Notice type="form" />
        <div className="draft-banner" role="note" style={{ maxWidth: 860, margin: "0 auto 10px" }}>
          <Icon name="pen" />
          <div>
            <b>프로젝트 기록으로 활동명·기간과 활동내용 초안을 채워 두었어요.</b>
            <span>활동내용은 개요·기록 문장을 그대로 옮긴 것이에요 (AI 작성 아님). 기관명을 빼고 객관적 사실만 {altLimit}자 안으로 다듬어 주세요. 활동(발행)기관·해당 페이지는 직접 확인해 적어요.</span>
          </div>
        </div>
        <div className="alt-tools" style={{ maxWidth: 860, margin: "0 auto" }}>
          <button className="btn sm" onClick={() => setStep(2)}>프로젝트 다시 고르기</button>
          {fillable && <button className="btn sm" onClick={() => fillAlt()}><Icon name="sparkle" />빈 활동내용 기록으로 채우기</button>}
        </div>
        <AltSheet alt={alt} name={userName} edit
          onHead={(k, v) => setAltNext({ ...alt, head: { ...alt.head, [k]: v } })}
          onRow={(i, k, v) => setAltNext({ ...alt, rows: rows.map((r, j) => (j === i ? { ...r, [k]: v, ...(k === "content" ? { src: "edited" } : {}) } : r)) as AltRow[] })}
          onDel={(i) => setAltNext({ ...alt, rows: alt.rows.filter((_, j) => j !== i) })}
          onAdd={() => alt.rows.length < (t.maxRows ?? 10) && setAltNext({ ...alt, rows: [...alt.rows, emptyAltRow()] })}
          onFill={(i) => fillAlt(i)}
          canFill={(r) => !!(r.pid && sources[r.pid])}
          onOath={(v) => setAltNext({ ...alt, oath: v })} />
        <div className="check-list" style={{ maxWidth: 860, margin: "14px auto 0" }}>
          <h5>제출 전 체크리스트</h5>
          <div className="hint" style={{ marginBottom: 8 }}>준비 상태만 직접 체크해요.</div>
          {(t.checklist ?? []).map((l, i) => (
            <label key={l}><input type="checkbox" checked={!!alt.checklist[i]} onChange={(e) => { const c = [...alt.checklist]; c[i] = e.target.checked; setAltNext({ ...alt, checklist: c }); }} />{l}</label>
          ))}
        </div>
        <div style={{ maxWidth: 860, margin: "0 auto" }}>{prompts([["altform-dongguk-2027", order.map((p) => sources[p])]])}</div>
      </>
    );
  }

  // ───── 미리보기 · 인쇄
  // PDF 저장: 미리보기와 같은 문서를 .app 밖(#rc-print)에 같은 상태로 그려 둔 것을 인쇄한다 (D010).
  // 지금 화면의 편집 상태를 그대로 쓰므로 저장 전이라도 최신 글이 나간다. 저장도 바로 요청해 둔다.
  async function printNow() {
    if (printing) return;
    setPrinting(true);
    void flush();
    try {
      await waitForPrintAssets();
      document.body.classList.add("rc-printing");
      const done = () => { document.body.classList.remove("rc-printing"); window.removeEventListener("afterprint", done); };
      window.addEventListener("afterprint", done);
      window.print();
    } finally {
      setPrinting(false);
    }
  }
  const isAlt = tpl.type === "altform";
  const docProps = { name: userName, profile: prof, order, sources, files: filesOf, content, variant };
  const missing = isAlt ? [] : emptyItems(docProps);

  const L = ["유형 선택", "경험 선택", "초안 편집"];
  const canGo = (k: number) => k < 3 || (built && order.length > 0);
  return (
    <div className="page">
      <div className="pf-top">
        <div className="crumb"><b>RE:Cord</b> &nbsp;›&nbsp; 포트폴리오 만들기</div>
        <div className="stepper">
          {L.map((t, i) => {
            const k = (i + 1) as Step, cls = k < step ? "done" : k === step ? "cur" : "";
            return (
              <span key={t} style={{ display: "contents" }}>
                {i > 0 && <span className="step-line" />}
                <a className={"step " + cls} href={`?step=${k}`} aria-current={k === step ? "step" : undefined}
                  onClick={(e) => { e.preventDefault(); if (canGo(k)) setStep(k); else toast("먼저 담을 프로젝트를 골라 주세요"); }}>
                  <span className="n">{k < step ? <Icon name="check" /> : k}</span>{t}
                </a>
              </span>
            );
          })}
        </div>
        <span style={{ width: 120 }} />
      </div>

      {step === 1 && step1()}
      {step === 2 && step2()}
      {step === 3 && (tpl.type === "altform" ? step3Alt() : step3Project())}
      {progressOverlay()}

      {preview && (
        <Modal title={isAlt ? "미리보기" : `미리보기 · ${VARIANT_INFO[variant].label} · A4 가로${pageTotal ? ` · ${pageTotal}쪽` : ""}`} wide onClose={() => setPreview(false)}>
          {/* 버튼은 맨 위에 두고, 창 안에서 스크롤해도 따라 보이게 (sticky) */}
          <div className="preview-bar no-print">
            <p>{isAlt ? "대체서식은 참고용입니다. 제출 전 해당 대학의 공식 서식·유의사항을 직접 확인하세요." : "기록과 다른 곳이 없는지 한 번 더 읽어 보세요."} 인쇄 창에서 대상을 ‘PDF로 저장’으로 고르면 파일로 저장돼요.</p>
            <div className="preview-actions">
              <button className="btn" onClick={() => setPreview(false)}>닫기</button>
              <button className="btn primary" disabled={printing} onClick={printNow}>{printing ? <><span className="spinner" />이미지·글꼴 준비 중…</> : <><Icon name="printer" /> PDF로 저장 / 인쇄</>}</button>
            </div>
          </div>
          {!isAlt && missing.length > 0 && (
            <div className="print-check no-print" role="note">
              <b><Icon name="info" /> 인쇄 전 확인 · 비어 있어 문서에서 빠진 항목 {missing.length}곳</b>
              <ul>{missing.slice(0, 6).map((m) => <li key={m}>{m}</li>)}</ul>
              {missing.length > 6 && <small>외 {missing.length - 6}곳</small>}
            </div>
          )}
          {isAlt ? <div className="doc-scroll"><AltSheet alt={alt} name={userName} edit={false} /></div>
            : <LandscapeDocument {...docProps} onPages={setPageTotal} />}
        </Modal>
      )}
      {preview && isAlt && <PrintPortal page="altform"><AltSheet alt={alt} name={userName} edit={false} /></PrintPortal>}
      {viewRecord && (
        <Modal title={viewRecord.title} onClose={() => setViewRecord(null)}>
          {viewRecord.text ? <div className="note-body">{viewRecord.text}</div> : <div className="empty-note">미리볼 본문이 없는 자료예요.</div>}
          <div className="modal-actions"><button className="btn primary" onClick={() => setViewRecord(null)}>닫기</button></div>
        </Modal>
      )}
    </div>
  );
}
