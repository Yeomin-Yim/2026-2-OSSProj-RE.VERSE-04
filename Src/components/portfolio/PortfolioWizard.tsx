"use client";

// 포트폴리오 만들기 3단계 (프로토타입 #/portfolio/1~3)
//   1 유형 선택: 프로젝트 포트폴리오 / 학교생활기록부 대체서식
//   2 경험 선택: 내 프로젝트(Supabase)와 기록 확인 7항목
//   3 초안 편집: 왼쪽 문서 구성 · 가운데 편집 · 오른쪽 참고 기록 / 대체서식 표 · 미리보기 · 인쇄
// 초안 만들기: 새로 담은 프로젝트마다 AI 초안(근거 문장이 있는 섹션만)을 받고, 비어 온 섹션은 개요의 글을 그대로 둔다. 학생이 고친다.
// 편집 내용은 portfolios 표에 자동 저장되고, 저장 결과(저장 중 / 저장됨 / 저장 실패)를 그대로 보여 준다.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { draftProject, savePortfolio } from "@/app/(app)/portfolio/actions";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { Notice } from "@/components/ui/Notice";
import { useToast } from "@/components/ui/Toast";
import {
  CHECK_LABEL, CHECK_ORDER, PROJECT_SECTIONS, TEMPLATES, altRow, draftFromOverview, emptyAltRow, emptyDraft, emptyProfile, period, promptsFor, templateList, topTags,
  type AltRow, type CheckKey, type PortfolioSource, type ProfileDraft, type ProjectDraft, type TemplateId,
} from "@/lib/core/index.ts";
import type { ProjectRow } from "@/lib/server/projects";
import type { Portfolio } from "@/lib/server/student/portfolio";
import { AltSheet, PortfolioSheet } from "./Sheets";

export type PickProject = ProjectRow & { checks: Record<CheckKey, boolean>; source: PortfolioSource };
type Step = 1 | 2 | 3;
type SaveState = "saved" | "saving" | "error";
const PROFILE = "__profile";
const MAX = 1000;
const pad = (n: number) => String(n).padStart(2, "0");

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
  const known = (ids: string[]) => ids.filter((id) => sources[id]);

  const [id, setId] = useState(initial.id);
  const [type, setType] = useState<TemplateId>(initialType ?? initial.template_id);
  const [order, setOrder] = useState<string[]>(known(initial.project_ids));
  const [selected, setSelected] = useState<string[]>(known(initial.project_ids));
  const [content, setContent] = useState<Record<string, ProjectDraft>>(initial.content);
  const [profile, setProfile] = useState<ProfileDraft | null>(initial.profile);
  const [alt, setAlt] = useState(initial.alt);
  const [built, setBuilt] = useState(!!initial.built_at && known(initial.project_ids).length > 0);
  const [step, setStepState] = useState<Step>(initialStep === 3 && !(initial.built_at && known(initial.project_ids).length) ? 2 : initialStep);
  const [cur, setCur] = useState<string>(known(initial.project_ids)[0] ?? PROFILE);
  const [save, setSave] = useState<SaveState>("saved");
  const [preview, setPreview] = useState(false);
  const [viewRecord, setViewRecord] = useState<{ title: string; text: string } | null>(null);
  const [flash, setFlash] = useState(false);
  const [building, setBuilding] = useState(false);
  const [drafting, setDrafting] = useState(false);

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
  const pending = useRef<Parameters<typeof savePortfolio>[1]>({});
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
  const queue = useCallback((patch: Parameters<typeof savePortfolio>[1], now = false) => {
    pending.current = { ...pending.current, ...patch };
    setSave("saving");
    if (timer.current) clearTimeout(timer.current);
    if (now) void flush();
    else timer.current = setTimeout(() => void flush(), 700);
  }, [flush]);
  useEffect(() => () => { if (timer.current) { clearTimeout(timer.current); void flush(); } }, [flush]);

  // 연결 그래프에서 서식을 골라 들어오면 그 서식을 저장
  useEffect(() => { if (initialType && initialType !== initial.template_id) queue({ template_id: initialType }, true); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const tpl = TEMPLATES[type];
  const prof = profile ?? emptyProfile();

  // ───── 1단계
  function step1() {
    return (
      <>
        <h1 className="title">어떤 형태로 정리할까요?</h1>
        <p className="subtitle">레퍼런스(Doc/ref) 서식을 그대로 따라요. 새 레퍼런스가 생기면 템플릿을 추가해요.</p>
        <div className="type-grid tpl" role="radiogroup">
          {templateList().map((t) => {
            const on = t.id === type;
            return (
              <button key={t.id} className={"type-card tpl" + (on ? " sel" : "")} role="radio" aria-checked={on}
                onClick={() => { setType(t.id); queue({ template_id: t.id }); }}>
                <span className="radio"><Icon name="check" /></span>
                <h3>{t.name}</h3>
                <div className="d">{t.desc}</div>
                <div className="body"><ul>
                  {(t.bullets ?? []).map(([b, s]) => <li key={b}><span className="ck"><Icon name="check" /></span><span><b>{b}</b><small>{s}</small></span></li>)}
                </ul></div>
                <div className="ref">레퍼런스 · {t.ref}</div>
              </button>
            );
          })}
        </div>
        <Notice type={tpl.notice === "form" ? "form" : "noai"} />
        <div className="pf-foot">
          <div className="msg"><svg className="sprout sp" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2.5" /><path d="M8 8h8M8 12h8M8 16h5" /></svg><span><b>진로가 정해지지 않아도 시작할 수 있어요.</b></span></div>
          <button className="btn primary" onClick={() => setStep(2)}>이 서식으로 시작 <Icon name="arrowR" /></button>
        </div>
      </>
    );
  }

  // ───── AI 초안: 근거가 없어 비어 온 섹션은 base 의 글을 그대로 둔다. 실패하면 이유(문자열)를 돌려준다
  async function aiDraft(pid: string, base: ProjectDraft): Promise<ProjectDraft | string> {
    if (!idRef.current) return "포트폴리오가 아직 저장되지 않았어요";
    const r = await draftProject(idRef.current, pid);
    if (!r.ok) return r.message;
    return { problem: r.data.problem.text || base.problem, role: r.data.role.text || base.role, result: r.data.result.text || base.result };
  }

  // ───── 2단계
  function toggle(pid: string) {
    setSelected((s) => (s.includes(pid) ? s.filter((x) => x !== pid) : [...s, pid]));
  }
  async function build() {
    if (!selected.length) return;
    const nextOrder = [...order.filter((x) => selected.includes(x)), ...selected.filter((x) => !order.includes(x))];
    // 처음 담는 프로젝트만 개요의 글을 그대로 옮긴다. 이미 고친 글은 그대로 둔다.
    const nextContent = { ...content };
    for (const pid of nextOrder) if (!nextContent[pid]) nextContent[pid] = draftFromOverview(sources[pid].overview);
    const keep = alt.rows.filter((r) => !r.pid || nextOrder.includes(r.pid));
    for (const pid of nextOrder) if (!keep.some((r) => r.pid === pid)) keep.push(altRow(sources[pid]));
    const firstBlank = keep.findIndex((r) => !r.pid && !r.name && !r.content);
    const rows = (firstBlank >= 0 ? [...keep.filter((r) => r.pid || r.name || r.content), ...keep.filter((r) => !(r.pid || r.name || r.content))] : keep);
    while (rows.length < (TEMPLATES["altform-dongguk-2027"].minRows ?? 5)) rows.push(emptyAltRow());
    const nextAlt = { ...alt, rows: rows.slice(0, TEMPLATES["altform-dongguk-2027"].maxRows ?? 10) };
    const nextProfile = profile ?? { ...emptyProfile(), skills: topTags(nextOrder.map((p) => sources[p])).join(", ") };
    setOrder(nextOrder); setContent(nextContent); setAlt(nextAlt); setProfile(nextProfile); setBuilt(true);
    setCur(nextOrder.includes(cur) ? cur : nextOrder[0]);
    queue({ template_id: type, project_ids: nextOrder, content: nextContent, alt: nextAlt, profile: nextProfile, built_at: new Date().toISOString() });
    setBuilding(true);
    try {
      if (!(await flush())) return;
      // 프로젝트 포트폴리오: 처음 담는 프로젝트만 AI 초안을 받는다 (이미 고친 글은 그대로)
      const fresh = TEMPLATES[type].type === "portfolio" ? nextOrder.filter((pid) => !content[pid]) : [];
      if (fresh.length) {
        const results = await Promise.all(fresh.map((pid) => aiDraft(pid, nextContent[pid])));
        const merged = { ...nextContent };
        fresh.forEach((pid, i) => { const r = results[i]; if (typeof r !== "string") merged[pid] = r; });
        const err = results.find((r): r is string => typeof r === "string");
        setContent(merged); queue({ content: merged });
        toast(err ? `AI 초안을 만들지 못한 프로젝트가 있어요 (${err}) · 개요의 글을 옮겼어요` : "AI 초안을 만들었어요 · 기록에 근거가 있는 내용만 담았어요");
      } else {
        toast("편집을 시작해요");
      }
      setStep(3);
    } finally {
      setBuilding(false);
    }
  }
  function step2() {
    return (
      <>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 8 }}>
          <div>
            <h1 className="title">담을 프로젝트를 선택해 주세요.</h1>
            <p className="subtitle">기록에서 확인된 항목을 보고 골라요.</p>
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
                <div className="pp">{period(p)} · 자료 {p.record_count}개</div>
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
          <div className="msg"><span><b>{selected.length}개 선택</b><small>{tpl.type === "altform" ? "활동명·기간을 프로젝트에서 가져와요. 활동내용은 직접 적어요." : "AI가 기록 문장을 근거로 초안을 써요. 기록에 없는 내용은 쓰지 않아요."}</small></span></div>
          <button className="btn primary" disabled={!selected.length || save === "saving" || building} onClick={build}>
            {building ? <><span className="spinner" />초안을 만드는 중…</> : tpl.type === "altform" ? <><Icon name="pen" />편집 시작</> : <><Icon name="sparkle" />초안 만들기</>}
          </button>
        </div>
      </>
    );
  }

  // ───── 3단계 (프로젝트 포트폴리오)
  function setDraft(pid: string, k: keyof ProjectDraft, v: string) {
    const next = { ...content, [pid]: { ...(content[pid] ?? emptyDraft()), [k]: v.slice(0, MAX) } };
    setContent(next); queue({ content: next });
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
    toast(`${pad(i + 1)} → ${pad(j + 1)}번으로 옮겼어요 · 미리보기 ${j + 2}쪽`);
  }
  async function redraft(pid: string) {
    const base = content[pid] ?? emptyDraft();
    if (PROJECT_SECTIONS.some((k) => base[k].trim()) && !window.confirm("지금 쓴 글을 AI 초안으로 바꿀까요? 근거가 없는 섹션은 지금 글을 그대로 둬요.")) return;
    setDrafting(true);
    const r = await aiDraft(pid, base);
    setDrafting(false);
    if (typeof r === "string") return toast("AI 초안을 만들지 못했어요: " + r);
    const next = { ...content, [pid]: r };
    setContent(next); queue({ content: next });
    toast("AI 초안으로 바꿨어요 · 기록과 다른 곳이 없는지 확인해 주세요");
  }
  function fillFromOverview(pid: string, k: keyof ProjectDraft) {
    const v = draftFromOverview(sources[pid].overview)[k];
    if (!v) return toast("개요에 이 항목이 비어 있어요. 프로젝트 관리 → 개요에서 먼저 적어 주세요.");
    setDraft(pid, k, v);
    toast("개요의 글을 그대로 옮겼어요");
  }
  const saveBadge = (
    <span className="save-state" role="status">
      {save === "saving" ? <><Icon name="refresh" /> 저장 중…</> : save === "error" ? <><Icon name="info" /> 저장 실패</> : <><Icon name="check" /> 저장됨</>}
    </span>
  );
  function prompts(keys: [TemplateId, PortfolioSource[]][], live = false) {
    return (
      <details className="prompt-box">
        <summary>{live ? "프롬프트 보기 · AI 초안에 쓰는 섹션별 지시문" : "프롬프트 보기 · AI 를 연결하면 보낼 지시문 (지금은 AI 미연결)"}</summary>
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
        <div className="ord-note">1쪽 프로필 → 프로젝트별 한 쪽 → 마지막 쪽 자기소개서 순서로 만들어져요.</div>
      </div>
    );
  }

  function profileEditor() {
    const t = TEMPLATES["portfolio-profile"];
    return (
      <div className="card panel resume">
        <h3 className="edit-title">프로필 · 자기소개</h3>
        <div className="edit-meta">1쪽(프로필·학력·스킬)과 마지막 쪽(자기소개서)에 들어가요 · 사람인 이력서 템플릿 디자인</div>
        <Notice type="noai" />
        {t.sections.map((sec) => {
          const k = sec.key as keyof ProfileDraft, v = prof[k] ?? "";
          const single = ["slogan", "skills", "education", "link"].includes(k);
          return (
            <div key={k} className="sec">
              <h4>{sec.label}{sec.manual && <> <span className="badge-ai">직접 입력</span></>}{k === "skills" && <> <span className="badge-ai">기록 태그에서 가져옴</span></>}</h4>
              {!sec.manual && <div className="g">{k === "skills" ? "내 기록에서 많이 나온 태그예요. 고쳐도 돼요." : "직접 작성해요. (AI 작성은 아직 연결 전)"}</div>}
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

  function step3Project() {
    const head = (
      <div className="page-head">
        <div><h1 className="title">프로젝트 포트폴리오</h1><p className="subtitle">사람인 이력서 템플릿 디자인 · 내 문장으로 쓰고 미리보기로 확인하세요.</p></div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>{saveBadge}<button className="btn primary" onClick={() => setPreview(true)}><Icon name="eye" /> 미리보기</button></div>
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
              <p className="hint" style={{ margin: "6px 0 0", lineHeight: 1.6 }}>사람인 템플릿 1쪽: 왼쪽 프로필(인사말·연락처), 오른쪽 학력·수상/자격증·스킬·주요 프로젝트.<br />2쪽: 왼쪽 슬로건, 오른쪽 지원동기·입사 후 포부.<br />연락처·주소는 인쇄 후 직접 적어요.</p>
            </div></div>
          </div>
        </>
      );
    }
    const s = sources[cur], d = content[cur] ?? emptyDraft(), pos = order.indexOf(cur);
    const secs = TEMPLATES["portfolio-project"].sections;
    return (
      <>
        {head}
        <div className="draft-grid">
          {orderList()}
          <div className={"card panel edit-card" + (flash ? " flash" : "")}>
            <h3 className="edit-title"><span className="ord-no">{pad(pos + 1)}</span>{s.title}</h3>
            <div className="edit-meta">{period(s)}{s.overview.activity ? " · " + s.overview.activity : ""} · <b className="ord-pos">포트폴리오 {pos + 2}쪽 · {pos + 1}/{order.length}번째 프로젝트</b></div>
            <Notice type="ai" extra="초안은 기록 문장을 근거로 썼고, 근거가 없는 섹션은 비워 둬요." />
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 6 }}>
              <button className="btn sm" disabled={drafting} onClick={() => redraft(cur)}>
                {drafting ? <><span className="spinner" />초안을 만드는 중…</> : <><Icon name="sparkle" />AI 초안 다시 만들기</>}
              </button>
            </div>
            {secs.map((sec) => {
              const k = sec.key as keyof ProjectDraft, v = d[k] ?? "";
              return (
                <div key={k} className="sec">
                  <h4 style={{ display: "flex", alignItems: "center", gap: 8 }}>{sec.label}
                    <button className="btn ghost" style={{ marginLeft: "auto" }} onClick={() => fillFromOverview(cur, k)} title="개요에 저장한 글을 그대로 붙여요">개요에서 가져오기</button>
                  </h4>
                  <div className="g">{sec.guide}</div>
                  <div className="ta">
                    <textarea rows={8} maxLength={MAX} value={v} placeholder="아직 비어 있어요. 오른쪽 참고 기록을 보며 직접 적어 보세요." onChange={(e) => setDraft(cur, k, e.target.value)} />
                    <span className="cnt">{v.length} / {MAX}</span>
                  </div>
                </div>
              );
            })}
            {prompts([["portfolio-project", [s]]], true)}
          </div>
          <div className="col-right"><div className="card panel">
            <div className="right-title" style={{ color: "var(--text)" }}><Icon name="rewrite" /> 문장 다듬기 <span className="badge-ai">AI 미연결</span></div>
            <div className="sub" style={{ fontSize: 11, margin: "3px 0 12px" }}>AI 문장 다듬기는 서버에 연결되면 쓸 수 있어요.</div>
            {([["scissors", "더 간결하게"], ["user", "내 역할 중심으로"], ["rewrite", "선택 부분 다시 쓰기"]] as const).map(([ic, label]) => (
              <button key={label} className="ai-btn" disabled title="AI 미연결" style={{ opacity: 0.55, cursor: "not-allowed" }}><Icon name={ic} />{label}<Icon name="chevR" /></button>
            ))}
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
  function step3Alt() {
    const t = TEMPLATES["altform-dongguk-2027"];
    return (
      <>
        <div className="page-head">
          <div><h1 className="title">{t.name}</h1><p className="subtitle">동국대학교 2027학년도 수시모집 서식 디자인 그대로 · 칸에 바로 입력하고 미리보기로 인쇄해요.</p></div>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>{saveBadge}<button className="btn primary" onClick={() => setPreview(true)}><Icon name="eye" /> 미리보기 / 인쇄</button></div>
        </div>
        <Notice type="form" />
        <Notice type="noai" extra="활동명·기간만 프로젝트에서 가져오고, 활동내용은 직접 적어요." />
        <div style={{ maxWidth: 860, margin: "0 auto" }}><button className="btn sm" onClick={() => setStep(2)}>프로젝트 다시 고르기</button></div>
        <AltSheet alt={alt} name={userName} edit
          onHead={(k, v) => setAltNext({ ...alt, head: { ...alt.head, [k]: v } })}
          onRow={(i, k, v) => setAltNext({ ...alt, rows: alt.rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)) as AltRow[] })}
          onDel={(i) => setAltNext({ ...alt, rows: alt.rows.filter((_, j) => j !== i) })}
          onAdd={() => alt.rows.length < (t.maxRows ?? 10) && setAltNext({ ...alt, rows: [...alt.rows, emptyAltRow()] })}
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

      {preview && (
        <Modal title="미리보기" wide onClose={() => setPreview(false)}>
          <style>{`@page{size:A4 ${landscape ? "landscape" : "portrait"};margin:10mm} .overlay .modal.wide{width:${landscape ? "min(1180px,100%)" : "min(900px,100%)"}}`}</style>
          {tpl.type === "altform"
            ? <AltSheet alt={alt} name={userName} edit={false} />
            : <PortfolioSheet name={userName} profile={prof} order={order} sources={sources} content={content} />}
          <p className="no-print" style={{ fontSize: 11, color: "#555", margin: "10px 0" }}>※ {tpl.type === "altform" ? "대체서식은 참고용입니다. 제출 전 해당 대학의 공식 서식·유의사항을 직접 확인하세요." : "AI 초안을 바탕으로 내가 고친 내용이에요. 기록과 다른 곳이 없는지 제출 전 한 번 더 읽어 보세요."}</p>
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
