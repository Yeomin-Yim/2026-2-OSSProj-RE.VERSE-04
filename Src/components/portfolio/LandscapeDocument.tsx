"use client";

// 포트폴리오 문서 — A4 가로(297×210mm) 고정 쪽 (D015)
//
// 1) 문서를 "블록"으로 만든다 (제목+첫 문단, 문단 조각, 사진, 카드, 표 …). 모든 글·숫자는 학생 기록·편집 내용에서 온다.
// 2) 화면 밖 측정 영역에서 인쇄와 같은 mm 폭으로 각 블록 높이를 잰다.
// 3) 블록을 쪽(page) → 줄(row: 왼쪽·오른쪽 단 또는 한 단)에 배치한다. 내용이 적으면 한 쪽으로 접히고, 많으면 다음 쪽으로 이어진다.
// 4) 같은 배치를 미리보기(축소)와 인쇄용 사본(#rc-print)이 함께 쓴다 → 미리보기 쪽 = PDF 쪽.
//
// 간단형: 표지(짧은 소개) → 프로젝트 목록 → 프로젝트별 1쪽 카드(개요·역할·과정 | 대표 결과물·성과·배운 점) → 성장 요약
// 상세형: 표지 → 학생 소개·대표 역량 → 목차 → 프로젝트별 OVERVIEW / RESEARCH & PROCESS / OUTCOME & REFLECTION → 종합 성장 분석 → 주요 증빙자료

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { period, type PortfolioSource, type ProfileDraft } from "@/lib/core/index.ts";
import { kindLabel, ymd } from "@/components/projects/format";
import { DETAILED_SECTIONS, SIMPLE_SECTIONS, keysFor, type ContentMap, type FileInfo, type ProjectContent, type SecKey, type Variant } from "./compose";
import { CoverImage } from "./CoverImage";
import { PrintPortal } from "./PrintPortal";

export interface DocProps {
  name: string;
  profile: ProfileDraft;
  order: string[];
  sources: Record<string, PortfolioSource>;
  files: Record<string, FileInfo[]>;
  content: ContentMap;
  variant: Variant;
}

// ───── 쪽 치수 (globals.css .lp-page 와 같은 값, mm)
const PAGE_H = 210, PAD_T = 11, PAD_B = 9, CHROME = 12, FOOT = 9;
const CONTENT_H = PAGE_H - PAD_T - PAD_B - CHROME - FOOT; // 169mm
const ROW_GAP = 5;
const PAGE_W_PX = 1122.5; // 297mm @96dpi

type W = "half" | "full";
interface B { id: string; w: W; node: React.ReactNode }
/** float: 어느 단이든 괜찮은 블록 (증빙 카드 등) — 쪽 배치 때 더 짧은 단 끝에 붙인다 */
interface Row { label?: string; header?: B; left?: B[]; right?: B[]; full?: B[]; float?: B[] }
/** compact: 내용이 한 쪽에 들어가면 쓰는 한 줄 배치 (상세형에서 기록이 적은 프로젝트를 빈 쪽 없이) */
interface Sec { key: string; chrome: string; cover?: React.ReactNode; band?: B; rows: Row[]; compact?: Row }
interface PageRow { header?: string; left: string[]; right: string[]; full: string[] }
interface Page { section: string; cover?: boolean; chrome: string; labels: string[]; band?: string; rows: PageRow[] }

const pad = (n: number) => String(n).padStart(2, "0");
const LABEL = Object.fromEntries([...SIMPLE_SECTIONS, ...DETAILED_SECTIONS].map((s) => [s.key, s.label])) as Record<SecKey, string>;
/** 상세형 항목 번호는 편집 화면과 같은 고정 번호 (빈 항목은 번호를 건너뛴다) */
const NO = Object.fromEntries(DETAILED_SECTIONS.map((s) => [s.key, pad(Number(s.no))])) as Record<SecKey, string>;
const sentences = (t: string) => (t.match(/[^.!?。\n]+[.!?。]?/g) ?? []).map((s) => s.trim()).filter(Boolean);
const firstSentences = (t: string | undefined, n = 1) => sentences(t ?? "").slice(0, n).join(" ");
const clip = (t: string, n: number) => (t.length > n ? t.slice(0, n).trimEnd() + "…" : t);
/** 빈 줄 = 문단, 줄바꿈(발췌 문장) = 같은 문단 */
const paras = (t: string) => t.split(/\n{2,}/).map((p) => p.split("\n").map((x) => x.trim()).filter(Boolean).join(" ")).filter(Boolean);
/** 긴 문단은 문장 단위로 잘라 여러 블록으로 (쪽 넘김이 문장 경계에서 일어나게) */
function chunks(t: string, max: number): string[] {
  const out: string[] = [];
  for (const p of paras(t)) {
    if (p.length <= max) { out.push(p); continue; }
    let cur = "";
    for (const s of sentences(p)) {
      if (cur && (cur + " " + s).length > max) { out.push(cur); cur = s; } else cur = cur ? cur + " " + s : s;
    }
    if (cur) out.push(cur);
  }
  return out;
}
const isPhoto = (f: FileInfo) => f.kind === "photo" && f.has_file;
const chosen = (c: ProjectContent | undefined, files: FileInfo[]) =>
  (c?.evidence ?? []).map((id) => files.find((f) => f.id === id)).filter((f): f is FileInfo => !!f);
/** 기록 날짜로 본 프로젝트 단계 (날짜가 프로젝트 기간의 앞/가운데/뒤 1/3 중 어디인지) */
function stageOf(f: FileInfo, p: PortfolioSource): string {
  if (!p.start_date || !f.recorded_at) return "";
  const s = Date.parse(p.start_date), e = Date.parse(p.end_date ?? f.recorded_at), d = Date.parse(f.recorded_at);
  if (!(e > s)) return "";
  const r = (d - s) / (e - s);
  return r < 0.34 ? "초기 단계" : r < 0.67 ? "중반 단계" : "마무리 단계";
}
function crossTags(ps: PortfolioSource[]) {
  const m = new Map<string, string[]>();
  for (const p of ps) for (const t of new Set(p.tags)) m.set(t, [...(m.get(t) ?? []), p.id]);
  return [...m].sort((a, b) => b[1].length - a[1].length);
}

// ───── 블록 만들기

function secBlocks(id: string, title: string, text: string, opts: { no?: string; max?: number; box?: string } = {}): B[] {
  // 짧은 문단은 max 글자까지 한 블록으로 묶고(상자 하나), 넘치면 다음 블록으로 (쪽 넘김은 블록 경계에서)
  const max = opts.max ?? 380;
  const parts: string[][] = [];
  for (const c of chunks(text, max)) {
    const last = parts[parts.length - 1];
    if (last && last.join("").length + c.length <= max) last.push(c); else parts.push([c]);
  }
  return parts.map((ps, i) => ({
    id: `${id}-${i}`,
    w: "half" as W,
    node: (
      <div className={"lp-sec" + (opts.box ? " lp-box " + opts.box : "") + (i ? " cont" : "")}>
        {i === 0 && title && <h3>{opts.no && <span>{opts.no}</span>}{title}</h3>}
        {ps.map((p, j) => <p key={j}>{p}</p>)}
      </div>
    ),
  }));
}

function figureBlock(id: string, f: FileInfo, p: PortfolioSource, caption?: string, shape: "" | "wide" = ""): B {
  const stage = stageOf(f, p);
  return {
    id, w: "half",
    node: (
      <figure className={"lp-fig " + shape}>
        <div className="lp-fig-img"><CoverImage recordId={f.id} alt={f.title} /></div>
        <figcaption><b>{f.title}</b><span>{[ymd(f.recorded_at), stage, f.is_result ? "결과물" : ""].filter(Boolean).join(" · ")}</span>{caption && <em>{caption}</em>}</figcaption>
      </figure>
    ),
  };
}

function cardBlock(id: string, f: FileInfo, p: PortfolioSource, w: W = "half"): B {
  const text = p.records.find((r) => r.id === f.id)?.text ?? "";
  const what = clip(firstSentences(text, 1), 90);
  return {
    id, w,
    node: (
      <div className="lp-card">
        <span className="lp-kind">{kindLabel(f.kind)}</span>
        <div><b>{f.title}</b>
          <small>{[ymd(f.recorded_at), stageOf(f, p), f.is_result ? "결과물" : "", f.has_file ? "원본 파일 첨부" : ""].filter(Boolean).join(" · ")}</small>
          {what && <p>{what}</p>}
          {f.url && <p className="lp-url">{f.url}</p>}
        </div>
      </div>
    ),
  };
}

function groupHead(id: string, no: string, en: string, ko: string): B {
  return { id, w: "full", node: <div className="lp-group"><span>{no}</span><b>{en}</b><i>{ko}</i></div> };
}

function pageHead(id: string, no: string, title: string, sub?: string): B {
  return { id, w: "full", node: <header className="lp-head"><span>{no}</span><div><h2>{title}</h2>{sub && <p>{sub}</p>}</div></header> };
}

// ───── 문서 구성

function buildSections(d: DocProps, pageOf: Record<string, number>): Sec[] {
  const { name, profile, variant, content, files } = d;
  const ps = d.order.map((id) => d.sources[id]).filter(Boolean);
  const skills = profile.skills.split(",").map((x) => x.trim()).filter(Boolean);
  const cross = crossTags(ps);
  const interests = skills.length ? skills : cross.slice(0, 6).map(([t]) => t);
  const repeated = cross.filter(([, ids]) => ids.length >= 2);
  const coverP = ps.find((p) => content[p.id]?.cover);
  const evAll = ps.flatMap((p) => chosen(content[p.id], files[p.id] ?? []).map((f) => ({ f, p })));
  const recTotal = ps.reduce((n, p) => n + (files[p.id]?.length ?? p.records.length), 0);
  const starts = ps.map((p) => p.start_date).filter(Boolean).sort() as string[];
  const ends = ps.map((p) => p.end_date ?? p.start_date).filter(Boolean).sort() as string[];
  const span = starts.length ? `${starts[0].slice(0, 7).replace("-", ".")} – ${(ends[ends.length - 1] ?? "").slice(0, 7).replace("-", ".")}` : "";
  const detailed = variant === "detailed";
  const pg = (k: string) => (pageOf[k] ? String(pageOf[k]) : "–");
  const secs: Sec[] = [];

  // 1. 표지
  const shortIntro = firstSentences(profile.motivation, 2);
  secs.push({
    key: "cover", chrome: "", rows: [],
    cover: (
      <div className="lp-cover">
        <div className="lp-cover-l">
          <div className="lp-cover-top"><img src="/brand/logo-horizontal.png" alt="RE:Cord" className="lp-cover-logo" /><span>PROJECT PORTFOLIO</span></div>
          <div className="lp-kicker">{detailed ? "상세형 · 탐구와 성장 사례집" : "간단형 · 핵심 프로젝트 사례집"}</div>
          <h1>프로젝트<br />포트폴리오</h1>
          {profile.slogan && <p className="lp-slogan">{profile.slogan}</p>}
          <div className="lp-name">{name}{profile.education && <small>{profile.education}</small>}</div>
          {!detailed && shortIntro && <p className="lp-cover-intro">{shortIntro}</p>}
          {interests.length > 0 && <div className="lp-chips">{interests.slice(0, 6).map((t) => <i key={t}>{t}</i>)}</div>}
          <div className="lp-cover-stats">
            <div><b>{ps.length}</b><span>프로젝트</span></div>
            {span && <div><b>{span}</b><span>활동 기간</span></div>}
            <div><b>{recTotal}</b><span>기록 자료</span></div>
            <div><b>{evAll.length}</b><span>증빙자료</span></div>
          </div>
        </div>
        <div className="lp-cover-r">
          {coverP ? (
            <figure><div className="lp-cover-img"><CoverImage recordId={content[coverP.id]!.cover!} alt={`${coverP.title} 대표 이미지`} /></div><figcaption>{coverP.title}</figcaption></figure>
          ) : (
            <ol className="lp-cover-list">{ps.slice(0, 6).map((p, i) => <li key={p.id}><span>{pad(i + 1)}</span><b>{p.title}</b><small>{period(p)}</small></li>)}</ol>
          )}
        </div>
      </div>
    ),
  });

  // 2. (상세형) 학생 소개와 대표 역량
  if (detailed) {
    const left: B[] = [];
    if (profile.motivation.trim()) left.push(...secBlocks("intro-me", "나의 소개", profile.motivation, { max: 420 }));
    left.push({
      id: "intro-topics", w: "half",
      node: <div className="lp-sec"><h3>탐구 주제</h3><ul className="lp-list">{ps.map((p) => <li key={p.id}><b>{p.title}</b>{(content[p.id]?.intro || p.topic) ? ` — ${content[p.id]?.intro || p.topic}` : ""}</li>)}</ul></div>,
    });
    const right: B[] = [
      { id: "intro-stats", w: "half", node: <div className="lp-sec"><h3>프로젝트로 쌓아 온 경험</h3><div className="lp-stats"><div><b>{ps.length}</b><span>프로젝트</span></div><div><b>{recTotal}</b><span>기록 자료</span></div><div><b>{evAll.length}</b><span>증빙자료</span></div></div>{span && <p className="lp-muted">활동 기간 {span}</p>}</div> },
    ];
    if (interests.length) right.push({ id: "intro-int", w: "half", node: <div className="lp-sec"><h3>관심 분야</h3><div className="lp-chips">{interests.map((t) => <i key={t}>{t}</i>)}</div></div> });
    if (repeated.length) right.push({ id: "intro-rep", w: "half", node: <div className="lp-sec"><h3>대표 역량 — 여러 프로젝트에서 반복된 키워드</h3><ul className="lp-list">{repeated.slice(0, 6).map(([t, ids]) => <li key={t}><b>{t}</b> — {ids.map((id) => d.sources[id]?.title).filter(Boolean).join(", ")}</li>)}</ul></div> });
    if (profile.education || profile.awards) right.push({ id: "intro-edu", w: "half", node: <div className="lp-sec">{profile.education && <><h3>학력</h3><p>{profile.education}</p></>}{profile.awards && <><h3>수상 · 자격</h3>{paras(profile.awards).map((x, i) => <p key={i}>{x}</p>)}</>}</div> });
    secs.push({ key: "intro", chrome: "학생 소개", band: pageHead("intro-h", "01", "학생 소개와 관심 분야", "관심 분야 · 탐구 주제 · 대표 역량"), rows: [{ label: "ABOUT ME", left, right }] });
  }

  // 3. 목차 / 프로젝트 목록
  if (detailed) {
    secs.push({
      key: "toc", chrome: "프로젝트 목차", band: pageHead("toc-h", "02", "프로젝트 목차", `${ps.length}개 프로젝트 · 상세형`),
      rows: [{ label: "CONTENTS", full: [{
        id: "toc-table", w: "full",
        node: (
          <table className="lp-toc">
            <thead><tr><th>No.</th><th>프로젝트</th><th>기간</th><th>주요 분야</th><th>나의 역할</th><th>쪽</th></tr></thead>
            <tbody>{ps.map((p, i) => (
              <tr key={p.id}><td className="no">{pad(i + 1)}</td><td><b>{p.title}</b></td><td className="nowrap">{period(p)}</td>
                <td>{p.tags.slice(0, 2).join(" · ") || p.topic || ""}</td><td>{clip(firstSentences(content[p.id]?.d_role), 70) || "—"}</td><td className="pg">{pg("case-" + p.id)}</td></tr>
            ))}</tbody>
          </table>
        ),
      }, {
        id: "toc-rest", w: "full",
        node: <ol className="lp-toc-rest"><li><span>종합 성장 및 역량 분석</span><i /><b>{pg("growth")}</b></li>{evAll.length > 0 && <li><span>주요 증빙자료</span><i /><b>{pg("appendix")}</b></li>}</ol>,
      }] }],
    });
  } else {
    const cards: B[] = [];
    for (let i = 0; i < ps.length; i += 3) {
      const group = ps.slice(i, i + 3);
      cards.push({
        id: "list-" + i, w: "full",
        node: <div className="lp-plist">{group.map((p, j) => (
          <div key={p.id} className="lp-pcard"><span className="no">{pad(i + j + 1)}</span><b>{p.title}</b><small>{period(p)} · {pg("case-" + p.id)}쪽</small>
            {(content[p.id]?.intro || p.topic) && <p className="lead">{content[p.id]?.intro || p.topic}</p>}
            {firstSentences(content[p.id]?.role) && <p><em>역할</em>{clip(firstSentences(content[p.id]?.role), 80)}</p>}
          </div>
        ))}</div>,
      });
    }
    secs.push({ key: "toc", chrome: "프로젝트 목록", band: pageHead("toc-h", "01", "프로젝트 목록", `${ps.length}개 프로젝트 · 간단형`), rows: [{ label: "PROJECTS", full: cards }] });
  }

  // 4. 프로젝트
  ps.forEach((p, i) => {
    const c = content[p.id] ?? {};
    const f = files[p.id] ?? [];
    const ev = chosen(c, f);
    const coverF = c.cover ? f.find((x) => x.id === c.cover) : undefined;
    const sid = "case-" + p.id;
    const band: B = {
      id: sid + "-band", w: "full",
      node: (
        <header className="lp-case-head">
          <div className="lp-kicker">{detailed ? "CASE" : "PROJECT"} {pad(i + 1)}</div>
          <h2>{p.title}</h2>
          <div className="lp-case-meta"><span>{period(p)}</span><span>기록 자료 {f.length || p.records.length}개</span><span>증빙 {ev.length}개</span>{p.tags.slice(0, detailed ? 6 : 4).map((t) => <i key={t}>{t}</i>)}</div>
          {(c.intro || p.topic) && <p className="lp-case-lead">{c.intro || p.topic}</p>}
        </header>
      ),
    };
    const txt = (k: SecKey) => (c[k] ?? "").trim();
    if (!detailed) {
      // 간단형: 한 쪽 카드 — 왼쪽 개요·역할·과정, 오른쪽 대표 결과물·성과·배운 점
      const left = (["problem", "role", "process"] as const).filter(txt).flatMap((k) => secBlocks(`${sid}-${k}`, LABEL[k], txt(k), { max: 420 }));
      const right: B[] = [];
      const rep = coverF ?? ev.find(isPhoto);
      if (rep) right.push(figureBlock(`${sid}-fig`, rep, p, undefined, "wide"));
      else if (ev[0]) right.push(cardBlock(`${sid}-card`, ev[0], p));
      if (txt("result")) right.push(...secBlocks(`${sid}-result`, LABEL.result, txt("result"), { box: "result", max: 420 }));
      if (txt("learn")) right.push(...secBlocks(`${sid}-learn`, LABEL.learn, txt("learn"), { max: 420 }));
      secs.push({ key: sid, chrome: `PROJECT ${pad(i + 1)} · ${p.title}`, band, rows: [{ label: "PROJECT SUMMARY", left, right }] });
      return;
    }
    // 상세형: 세 묶음 — 내용이 있는 묶음만, 내용 양에 따라 쪽이 이어진다
    const S = (k: SecKey, box?: string) => (txt(k) ? secBlocks(`${sid}-${k}`, LABEL[k], txt(k), { no: NO[k], box }) : []);
    const rows: Row[] = [];
    // OVERVIEW
    {
      const left = [...S("d_problem"), ...S("d_goal")];
      const right: B[] = [];
      if (coverF) right.push(figureBlock(`${sid}-cover`, coverF, p, "대표 이미지"));
      // 역할 상자는 더 짧은 단으로 (대표 이미지가 크면 왼쪽 서술 아래로)
      const float = S("d_role", "role");
      if (left.length || right.length || float.length) rows.push({ label: "PROJECT OVERVIEW", header: groupHead(`${sid}-g1`, "01", "PROJECT OVERVIEW", "프로젝트 소개와 문제 정의"), left, right, float });
    }
    // RESEARCH & PROCESS
    {
      const left = [...S("d_process"), ...S("d_decision")];
      const right: B[] = [];
      const tl = [...f].sort((a, b) => a.recorded_at.localeCompare(b.recorded_at)).slice(0, 8);
      if (tl.length) right.push({
        id: `${sid}-tl`, w: "half",
        node: <div className="lp-sec lp-timeline"><h3>진행 기록 · 타임라인</h3><ol>{tl.map((t) => <li key={t.id}><time>{ymd(t.recorded_at)}</time><span>{t.title}</span><em>{kindLabel(t.kind)}</em></li>)}</ol></div>,
      });
      ev.filter((x) => isPhoto(x) && x.id !== c.cover).slice(0, 2).forEach((x, j) => right.push(figureBlock(`${sid}-pph${j}`, x, p, "과정 자료", "wide")));
      right.push(...S("d_trial"));
      if (left.length || right.length) rows.push({ label: "RESEARCH & PROCESS", header: groupHead(`${sid}-g2`, "02", "RESEARCH & PROCESS", "탐구와 실행 과정"), left, right });
    }
    // OUTCOME & REFLECTION
    {
      const left: B[] = [...S("d_result")];
      const fb = txt("d_feedback");
      if (fb) {
        const ss = sentences(fb);
        const got = ss.filter((x) => /피드백|의견|조언|지적|코멘트|질문|반응/u.test(x));
        const fix = ss.filter((x) => !got.includes(x) && /수정|바꿨|바꾸|고쳤|반영|개선|보완|변경|정리/u.test(x));
        if (got.length && fix.length) {
          const rest = ss.filter((x) => !got.includes(x) && !fix.includes(x));
          left.push({
            id: `${sid}-fb`, w: "half",
            node: <div className="lp-sec"><h3><span>{NO.d_feedback}</span>{LABEL.d_feedback}</h3><div className="lp-compare"><div><b>받은 의견</b><p>{got.slice(0, 4).join(" ")}</p></div><div><b>고친 점</b><p>{fix.slice(0, 4).join(" ")}</p></div></div></div>,
          });
          if (rest.length) left.push(...secBlocks(`${sid}-fbr`, "", rest.join(" ")));
        } else left.push(...S("d_feedback"));
      }
      const float = ev.filter((x) => !isPhoto(x)).map((x, j) => cardBlock(`${sid}-ev${j}`, x, p));
      const right = [...S("d_learning", "learn"), ...S("d_next")];
      if (left.length || right.length || float.length) rows.push({ label: "OUTCOME & REFLECTION", header: groupHead(`${sid}-g3`, "03", "OUTCOME & REFLECTION", "결과와 성장"), left, right, float });
    }
    // 압축 배치: 같은 블록을 한 줄(왼쪽=서술, 오른쪽=역할·자료·성찰)로. 쪽 배치가 한 쪽에 들어갈 때만 고른다
    const all = rows.flatMap((r) => [...(r.left ?? []), ...(r.right ?? []), ...(r.float ?? [])]);
    const rightIds = new Set(rows.flatMap((r) => (r.right ?? []).map((b) => b.id)));
    const floatIds = new Set(rows.flatMap((r) => (r.float ?? []).map((b) => b.id)));
    const compact: Row = {
      label: "PROJECT OVERVIEW · PROCESS · OUTCOME",
      left: all.filter((b) => !rightIds.has(b.id) && !floatIds.has(b.id)),
      // 대표 이미지만 오른쪽에 고정하고, 역할·타임라인·성찰·자료 카드는 짧은 단으로 나눠 붙인다
      right: all.filter((b) => b.id === `${sid}-cover`),
      float: all.filter((b) => (rightIds.has(b.id) && b.id !== `${sid}-cover`) || floatIds.has(b.id)),
    };
    secs.push({ key: sid, chrome: `CASE ${pad(i + 1)} · ${p.title}`, band, rows, compact });
  });

  // 5. 성장
  const learnOf = (p: PortfolioSource) => firstSentences(detailed ? content[p.id]?.d_learning : content[p.id]?.learn, 2);
  const learns = ps.map((p) => ({ p, t: learnOf(p) })).filter((x) => x.t);
  const nexts = detailed ? ps.map((p) => ({ p, t: firstSentences(content[p.id]?.d_next) })).filter((x) => x.t) : [];
  {
    const left: B[] = [];
    if (cross.length) left.push({
      id: "gr-matrix", w: "half",
      node: (
        <div className="lp-sec"><h3>프로젝트에 걸쳐 나타난 키워드</h3>
          <table className="lp-matrix"><thead><tr><th>키워드</th>{ps.map((p, i) => <th key={p.id}>{pad(i + 1)}</th>)}<th>합계</th></tr></thead>
            <tbody>{cross.slice(0, detailed ? 10 : 6).map(([t, ids]) => <tr key={t}><td>{t}</td>{ps.map((p) => <td key={p.id} className="dot">{ids.includes(p.id) ? "●" : ""}</td>)}<td className="sum">{ids.length}</td></tr>)}</tbody>
          </table>
          <p className="lp-muted">프로젝트 기록에서 찾은 키워드 · 번호는 {detailed ? "목차" : "목록"}의 프로젝트 번호</p>
        </div>
      ),
    });
    const right: B[] = [];
    if (learns.length) right.push({ id: "gr-learn", w: "half", node: <div className="lp-sec"><h3>{detailed ? "프로젝트별 성찰과 성장" : "프로젝트에서 배운 점"}</h3><ul className="lp-learn">{learns.map(({ p, t }) => <li key={p.id}><b>{p.title}</b><p>{t}</p></li>)}</ul></div> });
    if (profile.aspiration.trim()) right.push(...secBlocks("gr-asp", "앞으로의 학습 · 진로 방향", profile.aspiration));
    else if (nexts.length) right.push({ id: "gr-next", w: "half", node: <div className="lp-sec"><h3>앞으로의 학습 · 진로 방향</h3><ul className="lp-learn">{nexts.map(({ p, t }) => <li key={p.id}><b>{p.title}</b><p>{t}</p></li>)}</ul></div> });
    if (left.length || right.length) secs.push({ key: "growth", chrome: detailed ? "종합 성장 및 역량 분석" : "성장 요약", band: pageHead("gr-h", detailed ? "03" : "02", detailed ? "종합 성장 및 역량 분석" : "성장 요약", "반복된 키워드 · 배운 점 · 앞으로의 방향"), rows: [{ label: "GROWTH", left, right }] });
  }

  // 6. (상세형) 주요 증빙자료
  if (detailed && evAll.length) {
    const rows: Row[] = [];
    ps.forEach((p, i) => {
      const ev = chosen(content[p.id], files[p.id] ?? []);
      if (!ev.length) return;
      // 사진(이미지+캡션)과 문서·링크 카드(무엇을 보여 주는지·주소)를 한 줄 4칸 격자로 섞는다
      const items = [...ev.filter(isPhoto), ...ev.filter((x) => !isPhoto(x))];
      const full: B[] = [];
      for (let k = 0; k < items.length; k += 4) full.push({
        id: `ap-${p.id}-${k}`, w: "full",
        node: <div className="lp-gallery">{items.slice(k, k + 4).map((x) => isPhoto(x) ? (
          <figure key={x.id} className="lp-fig"><div className="lp-fig-img"><CoverImage recordId={x.id} alt={x.title} /></div><figcaption><b>{x.title}</b><span>{[ymd(x.recorded_at), stageOf(x, p)].filter(Boolean).join(" · ")}</span></figcaption></figure>
        ) : <div key={x.id}>{cardBlock("x", x, p).node}</div>)}</div>,
      });
      rows.push({ label: "EVIDENCE", header: groupHead(`ap-${p.id}-h`, pad(i + 1), p.title, period(p)), full });
    });
    secs.push({ key: "appendix", chrome: "주요 증빙자료", band: pageHead("ap-h", "04", "주요 증빙자료", "프로젝트별로 고른 사진 · 문서 · 결과물 · 링크 (원본은 제출 시 따로 첨부)"), rows });
  }
  return secs;
}

// ───── 쪽 배치

function paginate(secs: Sec[], h: (id: string) => number, H: number, gap: number): Page[] {
  const pages: Page[] = [];
  for (const sec of secs) {
    if (sec.cover) { pages.push({ section: sec.key, cover: true, chrome: "", labels: [], rows: [] }); continue; }
    let page: Page = { section: sec.key, chrome: sec.chrome, labels: [], rows: [], band: sec.band?.id };
    let used = sec.band ? h(sec.band.id) : 0;
    let rows = sec.rows;
    if (sec.compact) {
      // 왼쪽·오른쪽 합을 떠 있는 블록까지 짧은 쪽에 붙여 계산해 한 쪽에 들어가면 압축 배치
      let lh = (sec.compact.left ?? []).reduce((n, b) => n + h(b.id), 0), rh = (sec.compact.right ?? []).reduce((n, b) => n + h(b.id), 0);
      for (const b of sec.compact.float ?? []) { if (lh <= rh) lh += h(b.id); else rh += h(b.id); }
      if (used + gap + Math.max(lh, rh) <= H) rows = [sec.compact];
    }
    pages.push(page);
    const fresh = () => { page = { section: sec.key, chrome: sec.chrome, labels: [], rows: [] }; pages.push(page); used = 0; };
    for (const row of rows) {
      const L = [...(row.left ?? [])], R = [...(row.right ?? [])], F = [...(row.full ?? [])];
      // 떠 있는 블록은 지금 더 짧은 단으로 (한쪽 단만 길어져 다음 쪽에 몇 개만 남는 일을 줄인다)
      for (const b of row.float ?? []) {
        const lh = L.reduce((n, x) => n + h(x.id), 0), rh = R.reduce((n, x) => n + h(x.id), 0);
        (lh <= rh ? L : R).push(b);
      }
      let first = true;
      while (L.length || R.length || F.length) {
        const gh = first && row.header ? h(row.header.id) : 0;
        const g = page.rows.length || page.band ? gap : 0;
        const heads = [L[0], R[0], F[0]].filter(Boolean).map((b) => h(b!.id));
        const minNeed = g + gh + Math.min(...heads);
        const total = gh + Math.max(L.reduce((n, b) => n + h(b.id), 0), R.reduce((n, b) => n + h(b.id), 0), F.reduce((n, b) => n + h(b.id), 0));
        // 남은 공간이 부족하거나, 새 묶음이 쪽 아래 1/4 남짓에 끼어 잘게 쪼개질 때는 다음 쪽에서 시작
        if (used > 0 && (H - used < minNeed || (first && H - used - g < Math.min(total, H * 0.2)))) { fresh(); continue; }
        const avail = H - used - g - gh;
        const take = (list: B[]) => {
          const out: string[] = []; let sum = 0;
          while (list.length && (sum + h(list[0].id) <= avail || (out.length === 0 && used === 0))) { sum += h(list[0].id); out.push(list.shift()!.id); }
          return { out, sum };
        };
        const l = take(L), r = take(R), f = take(F);
        if (!l.out.length && !r.out.length && !f.out.length) { fresh(); continue; }
        page.rows.push({ header: first && row.header ? row.header.id : undefined, left: l.out, right: r.out, full: f.out });
        if (row.label && !page.labels.includes(row.label)) page.labels.push(row.label);
        used += g + gh + Math.max(l.sum, r.sum, f.sum);
        first = false;
        if (L.length || R.length || F.length) fresh();
      }
    }
  }
  return pages;
}

// ───── 컴포넌트

export function LandscapeDocument(props: DocProps & { onPages?: (total: number) => void; print?: boolean }) {
  const { onPages, print = true } = props;
  const meas = useRef<HTMLDivElement>(null);
  const mm = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState<Page[] | null>(null);
  const [zoom, setZoom] = useState(1);
  const sig = useRef("");

  // 1차: 쪽 번호 없이 만든 블록으로 높이를 잰다 (쪽 번호 숫자는 높이에 영향이 없다)
  const draft = buildSections(props, {});
  // 측정·렌더링할 모든 블록 (떠 있는 블록 포함, id 기준으로 한 번씩)
  const allBlocks = (secs: Sec[]) => {
    const seen = new Map<string, B>();
    for (const s of secs) for (const b of [...(s.band ? [s.band] : []), ...s.rows.flatMap((r) => [...(r.header ? [r.header] : []), ...(r.left ?? []), ...(r.right ?? []), ...(r.full ?? []), ...(r.float ?? [])])]) seen.set(b.id, b);
    return [...seen.values()];
  };

  useLayoutEffect(() => {
    if (!meas.current || !mm.current) return;
    const run = () => {
      const px = mm.current!.getBoundingClientRect().width / 100;
      const heights = new Map<string, number>();
      meas.current!.querySelectorAll<HTMLElement>("[data-bid]").forEach((el) => heights.set(el.dataset.bid!, el.getBoundingClientRect().height));
      const h = (id: string) => heights.get(id) ?? 0;
      const next = paginate(draft, h, CONTENT_H * px, ROW_GAP * px);
      const key = JSON.stringify(next);
      if (key !== sig.current) { sig.current = key; setPages(next); onPages?.(next.length); }
    };
    run();
    const ro = new ResizeObserver(run);
    meas.current.querySelectorAll("[data-bid]").forEach((el) => ro.observe(el));
    document.fonts?.ready.then(run);
    return () => ro.disconnect();
  });

  // 미리보기 폭에 맞춰 축소 (측정·인쇄는 실제 크기)
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const fit = () => setZoom(Math.min(1, (el.clientWidth - 24) / PAGE_W_PX));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pageOf: Record<string, number> = {};
  pages?.forEach((p, i) => { if (!(p.section in pageOf)) pageOf[p.section] = i + 1; });
  const final = buildSections(props, pageOf);
  const byId = new Map(allBlocks(final).map((b) => [b.id, b]));
  const covers = new Map(final.filter((s) => s.cover).map((s) => [s.key, s.cover]));
  const blk = (id: string) => <div className="lp-b" key={id}>{byId.get(id)?.node}</div>;

  const render = (list: Page[]) => list.map((p, i) => (
    <section key={i} className={"lp-page" + (p.cover ? " cover" : "")}>
      {p.cover ? covers.get(p.section) : (
        <>
          <header className="lp-chrome"><span>{p.chrome}</span><b>{p.labels.join(" · ")}</b></header>
          <div className="lp-body">
            {p.band && blk(p.band)}
            {p.rows.map((r, j) => (
              <div className="lp-row" key={j}>
                {r.header && blk(r.header)}
                {r.full.length ? <div className="lp-fullcol">{r.full.map(blk)}</div> : (
                  <div className="lp-cols"><div>{r.left.map(blk)}</div><div>{r.right.map(blk)}</div></div>
                )}
              </div>
            ))}
          </div>
          <footer className="lp-foot"><span><b>RE:Cord</b> · {props.name} 포트폴리오</span><span>{i + 1} / {list.length}</span></footer>
        </>
      )}
    </section>
  ));

  return (
    <div className="lp-wrap">
      {/* 측정 영역: 화면 밖, 인쇄와 같은 mm 폭 */}
      <div className="lp-doc lp-measure" ref={meas} aria-hidden="true">
        <div ref={mm} style={{ width: "100mm", height: 0 }} />
        <div className="lp-meas-full">{allBlocks(draft).filter((b) => b.w === "full").map((b) => <div className="lp-b" data-bid={b.id} key={b.id}>{b.node}</div>)}</div>
        <div className="lp-meas-half">{allBlocks(draft).filter((b) => b.w === "half").map((b) => <div className="lp-b" data-bid={b.id} key={b.id}>{b.node}</div>)}</div>
      </div>
      <div className="lp-scroll" ref={scroller}>
        {pages ? <div className="lp-doc lp-pages" style={{ zoom }}>{render(pages)}</div> : <div className="lp-wait">쪽을 나누고 있어요…</div>}
      </div>
      {print && pages && <PrintPortal page="landscape"><div className="lp-doc">{render(pages)}</div></PrintPortal>}
    </div>
  );
}

/** 문서에서 빠지는 빈 항목 (미리보기의 "인쇄 전 확인") */
export function emptyItems(d: Pick<DocProps, "order" | "sources" | "content" | "variant" | "profile">): string[] {
  const out: string[] = [];
  if (!d.profile.motivation.trim()) out.push(d.variant === "detailed" ? "나의 소개 글 (표지·나의 소개 편집)" : "표지의 짧은 소개 (표지·나의 소개 편집)");
  for (const id of d.order) {
    const p = d.sources[id];
    if (!p) continue;
    const miss = keysFor(d.variant).filter((k) => k !== "intro" && !(d.content[id]?.[k] ?? "").trim()).map((k) => LABEL[k]);
    if (miss.length) out.push(`${p.title}: ${miss.join(", ")}`);
  }
  return out;
}
