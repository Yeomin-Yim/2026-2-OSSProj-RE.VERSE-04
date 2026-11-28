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
import { draftProject, refineText, savePortfolio } from "@/app/(app)/portfolio/actions";
import { kindIcon, kindLabel, ymd } from "@/components/projects/format";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { Notice } from "@/components/ui/Notice";
import { Segmented } from "@/components/ui/Segmented";
import { useToast } from "@/components/ui/Toast";
import {
  CHECK_LABEL, CHECK_ORDER, REFINE_LABEL, TEMPLATES, wordDiff, altRow, emptyAltRow, emptyProfile, period, promptsFor, templateList, topTags,
  type AltRow, type CheckKey, type PortfolioSource, type ProfileDraft, type ProjectDraft, type RefineMode, type TemplateId,
} from "@/lib/core/index.ts";
import type { ProjectRow } from "@/lib/server/projects";
import type { Portfolio } from "@/lib/server/student/portfolio";
import {
  altContent, edit, editedCount, fillMissing, photoFiles, refill, sectionsFor, totalLength, withEvidenceDefaults,
  EVIDENCE_NO, META, ORIGIN_HINT, ORIGIN_LABEL,
  type AiTexts, type ContentMap, type FileInfo, type ProjectContent, type SecKey, type SectionDef, type Variant,
} from "./compose";
import { CoverImage } from "./CoverImage";
import { AltSheet, PortfolioSheet, type AltRowX } from "./Sheets";

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
    label: "간단형", pages: "프로젝트당 약 1쪽", target: 1300,
    desc: "여러 프로젝트를 부담 없이 정리하는 1쪽 사례집",
    items: ["프로젝트 정보 · 대표 이미지 · 한 줄 소개", "문제와 목표", "나의 역할", "실행 과정", "결과와 배움"],
  },
  detailed: {
    label: "상세형", pages: "프로젝트당 약 2쪽", target: 3500,
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
  // 문장 다듬기: 마지막으로 만진 섹션의 textarea 와 그 선택 범위를 쓴다 (프로토타입 focusSec)
  const areas = useRef<Partial<Record<SecKey, HTMLTextAreaElement | HTMLInputElement | null>>>({});
  const focusSec = useRef<SecKey | null>(null);
  const [refining, setRefining] = useState<RefineMode | null>(null);
  const [diff, setDiff] = useState<{ mode: RefineMode; pid: string; sec: SecKey; secName: string; start: number; end: number; original: string; text: string; changed: boolean } | null>(null);

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
              ? [["간단형 · 상세형 중 선택", "프로젝트당 약 1쪽 / 약 2쪽"], ["1쪽 프로필 · 마지막 쪽 자기소개서", "사람인 이력서 템플릿 디자인"], ["기록으로 채운 초안부터 시작", "고치고 싶은 문장만 고쳐요"]]
              : t.bullets ?? [];
            return (
              <button key={t.id} className={"type-card tpl" + (on ? " sel" : "")} role="radio" aria-checked={on}
                onClick={() => { setType(t.id); queue({ template_id: t.id }); }}>
                <span className="radio"><Icon name="check" /></span>
                <h3>{t.name}</h3>
                <div className="d">{t.desc}</div>
                <div className="body"><ul>
                  {bullets.map(([b, s]) => <li key={b}><span className="ck"><Icon name="check" /></span><span><b>{b}</b><small>{s}</small></span></li>)}
                </ul></div>
                <div className="ref">레퍼런스 · {t.ref}</div>
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
    const nextProfile = profile ?? { ...emptyProfile(), skills: topTags(nextOrder.map((p) => sources[p])).join(", ") };
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
  async function refine(mode: RefineMode) {
    const pid = cur, sec = focusSec.current;
    if (!sec) return toast("다듬을 항목의 글을 먼저 눌러 주세요.");
    const t = areas.current[sec];
    const value = content[pid]?.[sec] ?? "";
    const a = t?.selectionStart ?? 0, b = t?.selectionEnd ?? 0, whole = !(b > a);
    const start = whole ? 0 : a, end = whole ? value.length : b, original = value.slice(start, end);
    if (!original.trim()) return toast("다듬을 문장이 없어요. 먼저 내용을 적어 주세요.");
    setRefining(mode); setDiff(null);
    const r = await refineText(mode, original);
    setRefining(null);
    if (!r.ok) return toast("다듬지 못했어요: " + r.message);
    const secName = sectionsFor(variant).find((x) => x.key === sec)?.label ?? sec;
    setDiff({ mode, pid, sec, secName, start, end, original, text: r.data.text, changed: r.data.changed });
  }
  function applyDiff() {
    if (!diff) return;
    const now = content[diff.pid]?.[diff.sec] ?? "";
    // 제안을 받는 사이에 글을 고쳤으면 위치가 어긋나므로 덮어쓰지 않는다
    if (now.slice(diff.start, diff.end) !== diff.original) { setDiff(null); return toast("그사이 글이 바뀌었어요. 다시 눌러 주세요."); }
    const lead = diff.original.match(/^\s*/)![0], trail = diff.original.match(/\s*$/)![0];
    setSec(diff.pid, diff.sec, now.slice(0, diff.start) + lead + diff.text + trail + now.slice(diff.end));
    setDiff(null);
    toast("적용했어요 · 문장을 한 번 더 읽어보세요");
  }
  function diffCard() {
    if (!diff || diff.pid !== cur) return null;
    const label = REFINE_LABEL[diff.mode];
    if (!diff.changed) return (
      <div className="diff-card"><div className="dh"><span>{label}</span></div><div className="nochg">더 다듬을 부분이 없어요.</div>
        <div className="modal-actions"><button className="btn sm" onClick={() => setDiff(null)}>확인</button></div></div>
    );
    return (
      <div className="diff-card">
        <div className="dh"><span>{label} · {diff.secName}</span><span className="hint">새 제안은 확인 후 적용</span></div>
        <div>{wordDiff(diff.original.trim(), diff.text).map((p, i) => p.op === "del" ? <del key={i}>{p.s}</del> : p.op === "ins" ? <ins key={i}>{p.s}</ins> : <span key={i}>{p.s}</span>)}</div>
        <div className="modal-actions"><button className="btn sm" onClick={() => setDiff(null)}>취소</button><button className="btn primary sm" onClick={applyDiff}>적용</button></div>
      </div>
    );
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
        <button className={"ord-item" + (isP ? " sel" : "")} onClick={() => setCur(PROFILE)}><span className="no">P</span>프로필 · 자기소개{isP && <small>현재 편집 중</small>}</button>
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
        <div className="ord-note">1쪽 프로필 → 프로젝트별 {variant === "simple" ? "한 쪽" : "두 쪽"} → 마지막 쪽 자기소개서 순서로 만들어져요.</div>
      </div>
    );
  }

  function profileEditor() {
    const t = TEMPLATES["portfolio-profile"];
    return (
      <div className="card panel resume">
        <h3 className="edit-title">프로필 · 자기소개</h3>
        <div className="edit-meta">1쪽(프로필·학력·스킬)과 마지막 쪽(자기소개서)에 들어가요 · 사람인 이력서 템플릿 디자인</div>
        <div className="notice notice-noai" role="note"><Icon name="info" /><span>스킬은 내 기록에서 많이 나온 키워드로 채웠어요. 자기소개서는 기록만으로 쓸 수 없어 직접 작성해요 (AI 작성 미연결).</span></div>
        {t.sections.map((sec) => {
          const k = sec.key as keyof ProfileDraft, v = prof[k] ?? "";
          const single = ["slogan", "skills", "education", "link"].includes(k);
          return (
            <div key={k} className="sec">
              <h4>{sec.label}{sec.manual && <> <span className="badge-ai">직접 입력</span></>}{k === "skills" && <> <span className="origin-badge record">기록 키워드에서 가져옴</span></>}</h4>
              {!sec.manual && <div className="g">{k === "skills" ? "내 기록에서 많이 나온 키워드예요. 고쳐도 돼요." : "직접 작성해요."}</div>}
              <div className="ta">
                {single ? (
                  <input value={v} maxLength={sec.limit} placeholder={sec.ph ?? ""} onChange={(e) => setProf(k, e.target.value)} />
                ) : (
                  <>
                    <textarea rows={4} value={v} maxLength={sec.limit} placeholder={sec.ph ?? ""} onChange={(e) => setProf(k, e.target.value)} />
                    {sec.limit && <span className="cnt">{v.length} / {sec.limit}</span>}
                  </>
                )}
              </div>
            </div>
          );
        })}
        {prompts([["portfolio-profile", order.map((p) => sources[p])]])}
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
      onFocus: () => { focusSec.current = sec.key; },
      placeholder: "짧게 직접 적어 보세요.",
      "aria-label": sec.label,
    };
    return (
      <div key={sec.key} className={"sec" + (v.trim() ? "" : " need")}>
        <h4 className="sec-h">
          {sec.no ? <span className="sec-no">{sec.no}</span> : <span className="sec-no sub" aria-hidden="true">·</span>}{sec.label}
          {origin ? <span className={"origin-badge " + origin} title={ORIGIN_HINT[origin]}>{ORIGIN_LABEL[origin]}</span>
            : v.trim() ? <span className="origin-badge saved" title="이전에 저장한 글이에요.">저장된 글</span>
            : <span className="origin-badge need">추가 확인 필요</span>}
          <button className="btn ghost sec-refill" onClick={() => refillSec(pid, sec)} title="개요·기록 원문에서 이 항목을 다시 채워요">기록에서 다시 채우기</button>
        </h4>
        <div className="g">{sec.guide}</div>
        <div className="ta">
          {sec.single
            ? <input {...common} ref={(el) => { areas.current[sec.key] = el; }} onChange={(e) => setSec(pid, sec.key, e.target.value)} />
            : <textarea {...common} rows={sec.rows} ref={(el) => { areas.current[sec.key] = el; }} onChange={(e) => setSec(pid, sec.key, e.target.value)} />}
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
            options={[{ value: "simple", label: "간단형 · 1쪽" }, { value: "detailed", label: "상세형 · 2쪽" }]} />
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
              <div className="right-title" style={{ color: "var(--text)" }}><Icon name="info" /> 레퍼런스 구조</div>
              <p className="hint" style={{ margin: "6px 0 0", lineHeight: 1.6 }}>사람인 템플릿 1쪽: 왼쪽 프로필(인사말·연락처), 오른쪽 학력·수상/자격증·스킬·주요 프로젝트.<br />마지막 쪽: 왼쪽 슬로건, 오른쪽 지원동기·앞으로의 포부.<br />연락처·주소는 인쇄 후 직접 적어요.</p>
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
                <span>항목마다 글의 출처를 표시해요 — <i className="origin-badge ai">AI 초안</i> 기록 문장 근거 확인 · <i className="origin-badge overview">개요에서 옮김</i> · <i className="origin-badge record">기록에서 발췌</i> 원문 그대로 · <i className="origin-badge edited">직접 수정함</i> 다시 채워도 유지</span>
              </div>
            </div>
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
            <div className="right-title" style={{ color: "var(--text)" }}><Icon name="rewrite" /> 문장 다듬기 <span className="badge-ai">AI</span></div>
            <div className="sub" style={{ fontSize: 11, margin: "3px 0 12px" }}>문장을 선택하고 눌러보세요. 선택하지 않으면 마지막으로 누른 항목 전체를 다듬어요.</div>
            {([["concise", "scissors", "더 간결하게"], ["role", "user", "내 역할 중심으로"], ["rewrite", "rewrite", "선택 부분 다시 쓰기"]] as const).map(([mode, ic, label]) => (
              <button key={mode} className="ai-btn" disabled={!!refining} onMouseDown={(e) => e.preventDefault()} onClick={() => refine(mode)}>
                {refining === mode ? <span className="spinner" /> : <Icon name={ic} />}{label}<Icon name="chevR" />
              </button>
            ))}
            {diffCard()}
            {variant === "simple" && (
              <>
                <h2 style={{ margin: "16px 0 4px", fontSize: 13 }}>증빙자료</h2>
                {evidencePicker(cur, true)}
              </>
            )}
            <h2 style={{ margin: "16px 0 4px", fontSize: 13 }}>참고할 기록</h2>
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
  function printNow() {
    document.body.classList.add("printing");
    const done = () => { document.body.classList.remove("printing"); window.removeEventListener("afterprint", done); };
    window.addEventListener("afterprint", done);
    window.print();
  }
  const landscape = tpl.type !== "altform";

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
        <Modal title={tpl.type === "altform" ? "미리보기" : `미리보기 · ${VARIANT_INFO[variant].label}`} wide onClose={() => setPreview(false)}>
          <style>{`@page{size:A4 ${landscape ? "landscape" : "portrait"};margin:10mm} .overlay .modal.wide{width:${landscape ? "min(1180px,100%)" : "min(900px,100%)"}}`}</style>
          {tpl.type === "altform"
            ? <AltSheet alt={alt} name={userName} edit={false} />
            : <PortfolioSheet name={userName} profile={prof} order={order} sources={sources} files={filesOf} content={content} variant={variant} />}
          <p className="no-print" style={{ fontSize: 11, color: "#555", margin: "10px 0" }}>※ {tpl.type === "altform" ? "대체서식은 참고용입니다. 제출 전 해당 대학의 공식 서식·유의사항을 직접 확인하세요." : "기록으로 채운 초안을 내가 고친 내용이에요. 기록과 다른 곳이 없는지 제출 전 한 번 더 읽어 보세요. ‘추가 확인 필요’ 칸은 인쇄 전에 채우거나 지워 주세요."}</p>
          <div className="modal-actions no-print">
            <button className="btn" onClick={() => setPreview(false)}>닫기</button>
            <button className="btn primary" onClick={printNow}><Icon name="printer" /> 인쇄 / PDF 저장</button>
          </div>
        </Modal>
      )}
      {viewRecord && (
        <Modal title={viewRecord.title} onClose={() => setViewRecord(null)}>
          {viewRecord.text ? <div className="note-body">{viewRecord.text}</div> : <div className="empty-note">미리볼 본문이 없는 자료예요.</div>}
          <div className="modal-actions"><button className="btn primary" onClick={() => setViewRecord(null)}>닫기</button></div>
        </Modal>
      )}
    </div>
  );
}
