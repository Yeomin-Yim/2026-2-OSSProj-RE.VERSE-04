"use client";

// 진로 탐색 그래프 — 프로토타입 #/learning (연결 그래프 · 나의 배움 정리) 이식
//   진입: "어느 쪽이 더 궁금한가요?" 대학 진학 / 취업
//   대학 진학: 루트 → 추천 학과 → 개설 대학 → 준비 정보 (+ 근거 프로젝트 · 노트)
//   취업:     루트 → 추천 직무 → 채용공고 · 준비 정보 (+ 근거 프로젝트 · 노트)
// 추천은 서버(loadExplore)가 점수표와 내 기록 태그로 계산한 것만 보여 준다. 점수표가 없으면 '준비 중' 안내.
// 예시 데이터는 시연 모드(?demo=1)에서만, 화면 위 띠로 구분해서 보여 준다.
// 그림은 SVG (라이브러리 없음). 노트·스크랩·체크리스트·탐색 위치는 DB 에 저장한다 (시연 모드 제외).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createNote, moveNote, saveExplorePlace } from "@/app/(app)/graph/actions";
import { STATUS_LABEL, ym } from "@/components/projects/format";
import { Icon } from "@/components/ui/Icon";
import { Notice } from "@/components/ui/Notice";
import { useToast } from "@/components/ui/Toast";
import { ScrapButton, TodoList, useStudent } from "@/components/student/StudentData";
import type { GraphProject } from "@/components/graph/GraphView";
import type { ExNode, ExploreData } from "@/lib/server/explore/explore";
import type { GraphNote } from "@/lib/server/student/notes";
import type { ScrapInput, ScrapLoc } from "@/lib/server/student/scraps";
import { CHECKLIST, INFO_LEAVES } from "./info";
import {
  PN, STARS, buildLayout, childrenOf, cleanPath, currentNode, findNode, nodeR, revealDelays,
  type LLink, type LNode, type Mode,
} from "./layout";
import { AddGraphNoteModal, NoteDock, ProjectDock } from "./NoteDock";
import styles from "./explore.module.css";

export interface ExplorePlace { mode: Mode | null; path: string[]; sel: string | null }

interface Props {
  data: ExploreData;
  projects: GraphProject[];
  notes: GraphNote[];
  place: ExplorePlace;
  open?: { note?: string; project?: string };
}

type Dock = { type: "note"; id: string } | { type: "project"; id: string } | null;
type View = { k: number; x: number; y: number };

const ACCENT = "#2C6CCB";
const COLORS: Record<string, string> = { root: "#1B2A4A", recommend: "#2C6CCB", target: "#80A5DE", posting: "#B7CCEC", info: "#FFFFFF", project: "#FADC67", note: ACCENT };
const LOADING_STEPS = ["프로젝트 기록 읽는 중", "관심 키워드 묶는 중", "학교·직무와 연결하는 중"];
const STATUS_TEXT: Record<string, (kind: string) => string> = {
  "no-profiles": (k) => `${k} 점수표(DB)가 아직 비어 있어요. 점수표를 수집하면 내 기록의 태그로 추천을 계산해 보여 드려요.`,
  "no-records": () => "태그가 붙은 기록이 아직 없어요. 프로젝트 관리에서 기록을 남기면 추천을 계산할 수 있어요.",
  "no-match": (k) => `${k} 점수표와 내 기록의 태그가 겹치는 칸이 아직 없어요. 기록이 쌓이면 다시 계산돼요.`,
};
const snap = (v: number) => Math.max(240, Math.round(v / 40) * 40);
const short = (s: string, n = 14) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

export function ExploreGraph({ data, projects, notes: initialNotes, place, open }: Props) {
  const router = useRouter();
  const toast = useToast();
  const { isScrapped } = useStudent();
  const demo = data.demo;

  // ───── 탐색 상태
  const [mode, setMode] = useState<Mode | null>(place.mode);
  const [path, setPath] = useState<string[]>(() => cleanPath(data, place.mode, place.path));
  const [sel, setSel] = useState<string | null>(() => (findNode(data, place.mode, place.sel) ? place.sel : null));
  const [dock, setDock] = useState<Dock>(() => (open?.note ? { type: "note", id: open.note } : open?.project ? { type: "project", id: open.project } : null));
  const [notes, setNotes] = useState(initialNotes);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(0);
  const [revealing, setRevealing] = useState(false);
  const [gen, setGen] = useState(0);
  const [hover, setHover] = useState<string | null>(null);
  const [adding, setAdding] = useState<string[] | null>(null);
  const [postings, setPostings] = useState<{ jobId: string; hi: string | null } | null>(() => {
    const p = cleanPath(data, place.mode, place.path);
    return place.mode === "career" && p.length ? { jobId: p[0], hi: null } : null;
  });
  const [moved, setMoved] = useState<Record<string, { x: number; y: number }>>({});
  const [dragPos, setDragPos] = useState<{ id: string; x: number; y: number } | null>(null);

  // ───── 화면 크기 · 확대
  const stage = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 900, h: 640 });
  const [view, setView] = useState<View>({ k: 1, x: 450, y: 260 });
  const [instant, setInstant] = useState(true);
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const measure = () => {
      const w = snap(el.clientWidth), h = snap(el.clientHeight);
      setSize((s) => (s.w === w && s.h === h ? s : { w, h }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const noteCount = useCallback((pid: string) => notes.filter((n) => n.project_ids.includes(pid)).length, [notes]);
  const layout = useMemo(
    () => (loading ? { nodes: [] as LNode[], links: [] as LLink[], focusId: null } : buildLayout({ data, mode, path, projects, notes, noteCount, moved })),
    [loading, data, mode, path, projects, notes, noteCount, moved],
  );
  const nodes = useMemo(
    () => (dragPos ? layout.nodes.map((n) => (n.id === dragPos.id ? { ...n, x: dragPos.x, y: dragPos.y } : n)) : layout.nodes),
    [layout.nodes, dragPos],
  );
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  // ───── 생성 모션: 처음 만들 때(gen 증가)는 전부, 노드를 눌러 펼칠 때는 새로 생긴 것만
  const prevIds = useRef<Set<string>>(new Set());
  const revealAll = useRef(false);
  const delays = useMemo(() => {
    if (revealAll.current) return revealDelays(layout.nodes);
    const fresh = new Set(layout.nodes.filter((n) => !prevIds.current.has(n.id)).map((n) => n.id));
    return prevIds.current.size ? revealDelays(layout.nodes, fresh) : new Map<string, number>();
  }, [layout.nodes, gen]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    prevIds.current = new Set(layout.nodes.map((n) => n.id));
    if (revealAll.current) {
      revealAll.current = false;
      const total = Math.max(0, ...delays.values()) + 620;
      setRevealing(true);
      const t = setTimeout(() => setRevealing(false), total);
      return () => clearTimeout(t);
    }
  }, [layout.nodes]); // eslint-disable-line react-hooks/exhaustive-deps

  // ───── 화면 맞추기: 경로·자식·프로젝트·노트(글자 포함)가 모두 보이게 (0.45~1.25배)
  const fit = useCallback((list: LNode[] = nodes) => {
    const ns = list.filter((n) => n.kind !== "bg");
    const W = size.w, H = size.h;
    if (!ns.length) { setView({ k: 1, x: W / 2, y: H / 2 - 40 }); return; }
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const n of ns) {
      const r = nodeR(n.kind);
      minX = Math.min(minX, n.x - r); maxX = Math.max(maxX, n.x + r + 135);
      minY = Math.min(minY, n.y - r - 10); maxY = Math.max(maxY, n.y + r + 24);
    }
    const padX = W < 600 ? 20 : 50, padTop = 64, padBottom = 56;
    const k = Math.min(1.25, Math.max(0.45, Math.min((W - padX * 2) / (maxX - minX), (H - padTop - padBottom) / (maxY - minY))));
    setView({ k, x: W / 2 - ((minX + maxX) / 2) * k, y: (padTop + H - padBottom) / 2 - ((minY + maxY) / 2) * k });
  }, [nodes, size]);
  const placeKey = `${mode}|${path.join(">")}|${loading}|${size.w}x${size.h}`;
  useEffect(() => { fit(layout.nodes); }, [placeKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setTimeout(() => setInstant(false), 50); return () => clearTimeout(t); }, []);

  // ───── 로딩 화면의 단계 문구
  useEffect(() => {
    if (!loading) return;
    const t = setInterval(() => setStep((s) => (s + 1) % LOADING_STEPS.length), 520);
    return () => clearInterval(t);
  }, [loading]);

  // ───── 탐색 위치 저장 (profiles.ui_state). 시연 모드는 저장하지 않는다
  const lastPlace = useRef(JSON.stringify({ mode, path, sel })); // 처음 들어온 위치는 다시 저장하지 않는다
  useEffect(() => {
    const key = JSON.stringify({ mode, path, sel });
    if (demo || loading || key === lastPlace.current) return;
    const t = setTimeout(() => { lastPlace.current = key; void saveExplorePlace({ mode, path, sel }); }, 800);
    return () => clearTimeout(t);
  }, [demo, loading, mode, path, sel]);

  // Esc: 선택 해제
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector(".overlay")) { setSel(null); setDock(null); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // ───── 선택 · 강조
  const gsel = dock?.type === "note" ? "note:" + dock.id : dock?.type === "project" ? PN(dock.id) : sel;
  const gselExplore = !!gsel && !dock;
  const adj = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const l of layout.links) {
      if (!m.has(l.s)) m.set(l.s, new Set());
      if (!m.has(l.t)) m.set(l.t, new Set());
      m.get(l.s)!.add(l.t); m.get(l.t)!.add(l.s);
    }
    return m;
  }, [layout.links]);
  const dimNode = (n: LNode) => !!gsel && n.id !== gsel && n.id !== hover && !adj.get(gsel)?.has(n.id) && !(gselExplore && n.onPath);
  const touches = (l: LLink) => !!gsel && (l.s === gsel || l.t === gsel);
  const dimLink = (l: LLink) => !!gsel && !touches(l) && !(gselExplore && l.kind === "path");

  const cur = currentNode(data, mode, path);
  const loc: ScrapLoc = { mode, path, sel };

  // ───── 동작
  function generate(ms: number) {
    setDock(null); setSel(null);
    setLoading(true); setStep(0);
    setTimeout(() => {
      revealAll.current = true;
      setLoading(false);
      setGen((g) => g + 1);
    }, ms);
  }
  function chooseMode(m: Mode) {
    setMode(m); setPath([]); setMoved({}); setPostings(null);
    generate(1200);
  }
  function reset() {
    setMode(null); setPath([]); setSel(null); setDock(null); setPostings(null); setMoved({});
  }
  function back() {
    if (!mode || !path.length) return;
    setPath((p) => p.slice(0, -1)); setSel(null); setDock(null); setPostings(null);
  }
  function selectNode(node: ExNode) {
    if (!mode || revealing) return;
    setDock(null);
    if (node.kind === "info") { setSel(node.id); return; }
    if (node.kind === "posting") { setSel(node.id); setPostings({ jobId: node.parentId!, hi: node.id }); scrollTo("exPostings"); return; }
    if (node.kind === "root") { setPath([]); setPostings(null); }
    else if (node.kind === "target") setPath([node.parentId!, node.id]);
    else setPath([node.id]);
    setSel(node.id);
    if (node.kind === "recommend" && mode === "career") setPostings({ jobId: node.id, hi: null });
    else setPostings(null);
  }
  function openNote(id: string) { setDock({ type: "note", id }); scrollTo("exDock"); }
  function openProject(pid: string) { setDock({ type: "project", id: pid }); scrollTo("exDock"); }
  function scrollTo(id: string) {
    setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 60);
  }
  function onNodeClick(n: LNode) {
    if (revealing) return;
    if (n.kind === "note" && n.noteId) return openNote(n.noteId);
    if (n.kind === "project" && n.pid) return openProject(n.pid);
    if (n.ref) selectNode(n.ref);
  }
  async function addNote(title: string, pids: string[]) {
    const r = await createNote(title, pids);
    toast(r.message || "노트를 만들지 못했어요");
    if (!r.ok || !r.data) return false;
    setNotes((list) => [...list, r.data!]);
    setDock({ type: "note", id: r.data.id });
    scrollTo("exDock");
    return true;
  }
  const defaultPids = () => (dock?.type === "project" ? [dock.id] : dock?.type === "note" ? notes.find((n) => n.id === dock.id)?.project_ids ?? [] : []);

  // ───── 끌기: 빈 곳 = 화면 이동, 노트·프로젝트 = 위치 옮기기
  const drag = useRef<{ id: number; sx: number; sy: number; vx: number; vy: number; moved: boolean; node?: LNode } | null>(null);
  const toWorld = (dx: number, dy: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    const s = rect ? size.w / rect.width : 1;
    return { dx: dx * s, dy: dy * s };
  };
  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    if (e.button !== 0) return;
    const hit = (e.target as Element).closest<SVGGElement>("[data-node]");
    const node = hit ? byId.get(hit.dataset.node!) : undefined;
    if (hit && !(node && (node.kind === "note" || node.kind === "project"))) return; // 일반 노드는 click 으로
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y, moved: false, node };
  }
  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const { dx, dy } = toWorld(e.clientX - d.sx, e.clientY - d.sy);
    if (Math.abs(dx) + Math.abs(dy) > 4) { if (!d.moved) setInstant(true); d.moved = true; }
    if (!d.moved) return;
    if (d.node) setDragPos({ id: d.node.id, x: d.node.x + dx / view.k, y: d.node.y + dy / view.k });
    else setView((v) => ({ ...v, x: d.vx + dx, y: d.vy + dy }));
  }
  function onPointerUp(e: React.PointerEvent<SVGSVGElement>) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    setInstant(false);
    if (d.node) {
      if (!d.moved) { onNodeClick(d.node); return; }
      const p = dragPos ?? { x: d.node.x, y: d.node.y };
      setDragPos(null);
      const pos = { x: Math.round(p.x), y: Math.round(p.y) };
      if (d.node.kind === "note" && d.node.noteId) {
        const id = d.node.noteId;
        setNotes((list) => list.map((n) => (n.id === id ? { ...n, pos } : n)));
        void moveNote(id, pos).then((r) => { if (!r.ok) toast("노트 위치를 저장하지 못했어요"); });
      } else setMoved((m) => ({ ...m, [d.node!.id]: pos }));
      return;
    }
    if (!d.moved && gsel) { setSel(null); setDock(null); } // 빈 곳을 누르면 선택 해제
  }
  // 마우스 휠 확대 (포인터 위치 기준). passive:false 로 페이지 스크롤을 막는다
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const s = size.w / rect.width;
      const px = (e.clientX - rect.left) * s, py = (e.clientY - rect.top) * s;
      setInstant(true);
      setView((v) => {
        const k = Math.min(2.5, Math.max(0.35, v.k * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
        return { k, x: px - ((px - v.x) * k) / v.k, y: py - ((py - v.y) * k) / v.k };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [size.w]);
  function zoomBy(f: number) {
    setInstant(false);
    setView((v) => {
      const k = Math.min(2.5, Math.max(0.35, v.k * f)), cx = size.w / 2, cy = size.h / 2;
      return { k, x: cx - ((cx - v.x) * k) / v.k, y: cy - ((cy - v.y) * k) / v.k };
    });
  }

  // ───── 스크랩 대상
  const scrapInput = (n: ExNode): ScrapInput | null =>
    n.scrapType ? { type: n.scrapType, ref_id: n.id, title: n.label, meta: { sub: n.sub }, loc: { mode, path: n.kind === "target" ? [n.parentId!, n.id] : [n.id], sel: n.id } } : null;
  const starOf = (n: LNode) => {
    if (demo) return false;
    if (n.kind === "project" && n.pid) return isScrapped("project", n.pid);
    if (n.kind === "note" && n.noteId) return isScrapped("note", n.noteId);
    if (n.ref?.scrapType) return isScrapped(n.ref.scrapType, n.id);
    return false;
  };

  // ───── 그리기
  const k = 1 / Math.max(view.k, 0.8); // 글자는 확대해도 너무 커지지 않게
  const side = mode ? data[mode] : null;
  const statusMsg = side && side.status !== "ready" && !path.length ? STATUS_TEXT[side.status]?.(mode === "college" ? "학과" : "직무") : null;

  function renderNode(n: LNode) {
    if (n.kind === "bg") return null;
    const r = nodeR(n.kind);
    const on = n.id === gsel, hov = n.id === hover, isFocus = n.id === layout.focusId, isNote = n.kind === "note";
    const delay = delays.get(n.id);
    const fs = 12 * k, fs2 = 9.5 * k;
    const tx = (isNote ? r * 1.2 : r) + 8;
    const ty = n.sub ? -fs * 0.55 : 0;
    return (
      <g key={gen + ":" + n.id} data-node={n.id} transform={`translate(${n.x} ${n.y})`}
        className={[styles.node, isNote ? styles.note : "", dimNode(n) ? styles.dim : ""].join(" ")}
        role="button" tabIndex={0} aria-label={`${n.label}${n.sub ? ", " + n.sub : ""}`} aria-pressed={on}
        onClick={() => { if (n.kind !== "note" && n.kind !== "project") onNodeClick(n); }}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onNodeClick(n); } }}
        onPointerEnter={() => setHover(n.id)} onPointerLeave={() => setHover((h) => (h === n.id ? null : h))}>
        <title>{n.label + (n.sub ? " · " + n.sub : "") + (n.ref?.score != null ? ` · ${demo ? "연결도" : "일치도"} ${n.ref.score}${demo ? "% (샘플)" : ""}` : "")}</title>
        <g className={delay != null ? styles.pop : undefined} style={delay != null ? { animationDelay: delay + "ms" } : undefined}>
          <circle className="halo" r={r + 8} fill={on || hov ? (isNote ? "rgba(44,108,203,.13)" : "rgba(44,108,203,.09)") : "transparent"} />
          {isNote ? (
            <>
              <rect x={-r * 1.2} y={-r * 0.95} width={r * 2.4} height={r * 1.9} rx={4} fill={ACCENT} />
              <path d={`M${-r * 0.6} ${-r * 0.3}H${r * 0.6}M${-r * 0.6} ${r * 0.3}H${r * 0.15}`} stroke="rgba(255,255,255,.92)" strokeWidth={1.5} strokeLinecap="round" />
            </>
          ) : n.kind === "project" ? (
            <>
              <rect x={-r} y={-r} width={r * 2} height={r * 2} rx={5} fill={COLORS.project} />
              <rect x={-r * 0.42} y={-r * 0.42} width={r * 0.84} height={r * 0.84} rx={2} fill="none" stroke="#fff" strokeWidth={1.6} />
            </>
          ) : (
            <circle r={r} fill={COLORS[n.kind] ?? COLORS.recommend} stroke={n.kind === "info" ? "#80A5DE" : "#fff"} strokeWidth={n.kind === "info" ? 2 : 1.5}
              style={isFocus ? { filter: "drop-shadow(0 0 7px rgba(44,108,203,.45))" } : undefined} />
          )}
          {on && <circle r={r + 8} fill="none" stroke={isNote ? ACCENT : "#1B2A4A"} strokeWidth={2} />}
          <text x={tx} y={ty} dominantBaseline="middle" fontSize={fs} strokeWidth={4 * k} className={styles.label + (isNote ? " " + styles.noteLabel : "")}>{short(n.label)}</text>
          {n.sub && <text x={tx} y={ty + fs * 1.15} dominantBaseline="middle" fontSize={fs2} strokeWidth={3 * k} className={styles.sub}>{short(n.sub, 22)}</text>}
          {starOf(n) && <text x={r * 0.95} y={-r * 0.95} textAnchor="middle" dominantBaseline="middle" fontSize={11 * k} strokeWidth={3 * k} className={styles.star}>★</text>}
        </g>
      </g>
    );
  }

  function renderLink(l: LLink, i: number) {
    const a = byId.get(l.s), b = byId.get(l.t);
    if (!a || !b) return null;
    const d = dimLink(l);
    const color = l.kind === "note" || l.kind === "path" ? (d ? "rgba(44,108,203,.14)" : "rgba(44,108,203,.7)") : d ? "rgba(128,165,222,.14)" : "rgba(128,165,222,.65)";
    const width = l.kind === "path" ? 2.2 : touches(l) ? 2.6 : l.kind === "note" ? 1.8 : 1.3;
    const delay = Math.max(delays.get(l.s) ?? -1, delays.get(l.t) ?? -1);
    const showLabel = (l.kind === "path" || l.kind === "child") && l.label && !d;
    const t = l.kind === "child" ? 0.74 : 0.5, fs = 9.5 * k;
    const mx = a.x + (b.x - a.x) * t, my = a.y + (b.y - a.y) * t - fs * 0.95;
    const w = (l.label?.length ?? 0) * fs * 0.95 + 8 * k, h = fs + 5 * k;
    return (
      <g key={gen + ":" + l.s + ">" + l.t + i} className={delay >= 0 ? styles.fade : undefined} style={delay >= 0 ? { animationDelay: delay + 260 + "ms" } : undefined}>
        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth={width} strokeDasharray={l.kind === "evidence" ? "4 4" : undefined} />
        {showLabel && (
          <g>
            <rect x={mx - w / 2} y={my - h / 2} width={w} height={h} rx={4 * k} className={styles.edgeLabelBg} />
            <text x={mx} y={my} textAnchor="middle" dominantBaseline="middle" fontSize={fs} className={styles.edgeLabel}>{l.label}</text>
          </g>
        )}
      </g>
    );
  }

  const crumbs = mode ? [data[mode].root, ...path.map((id) => findNode(data, mode, id)).filter((n): n is ExNode => !!n)] : [];
  const dockNote = dock?.type === "note" ? notes.find((n) => n.id === dock.id) : undefined;
  const dockProject = dock?.type === "project" ? projects.find((p) => p.id === dock.id) : undefined;
  const selNode = findNode(data, mode, sel);

  return (
    <>
      <div className="workspace">
        <section className="graph-shell" aria-label="진로 탐색 그래프">
          <div className="graph-toolbar">
            <div className="crumbs">
              {!mode ? <span className="lm-crumb current">탐색 시작</span> : crumbs.map((n, i) => (
                <span key={n.id} style={{ display: "contents" }}>
                  {i > 0 && <span className="crumb-sep">›</span>}
                  <button className={"lm-crumb" + (i === crumbs.length - 1 ? " current" : "")} onClick={() => selectNode(n)} aria-label={`${n.label}(으)로 이동`}>{n.label}</button>
                </span>
              ))}
            </div>
            <div className="toolbar-actions">
              {mode && <button className="tool-btn add" onClick={() => setAdding(defaultPids())}>+ 노트 추가</button>}
              {mode && <button className="tool-btn" disabled={revealing || loading} onClick={() => generate(900)} title="생성 모션 다시 보기">↻ 다시 보기</button>}
              {mode && path.length > 0 && <button className="tool-btn" onClick={back}>← 이전</button>}
              <button className="tool-btn" onClick={reset}>처음부터</button>
            </div>
          </div>

          <div className="stage" ref={stage} style={revealing ? { pointerEvents: "none" } : undefined}>
            <svg ref={svgRef} className={styles.svg} viewBox={`0 0 ${size.w} ${size.h}`} preserveAspectRatio="xMidYMid meet"
              role="group" aria-label="탐색 그래프" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
              onPointerCancel={() => { drag.current = null; setDragPos(null); }}>
              <g className={styles.world + (instant ? " " + styles.instant : "")} style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}>
                <g aria-hidden="true">
                  {STARS.links.map((l, i) => {
                    const a = STARS.nodes[+l.s.slice(2)], b = STARS.nodes[+l.t.slice(2)];
                    return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="rgba(128,165,222,.18)" strokeWidth={0.5} />;
                  })}
                  {STARS.nodes.map((s) => <circle key={s.id} cx={s.x} cy={s.y} r={s.r} fill={(s.tone ?? 0) > 0.8 ? "rgba(128,165,222,.38)" : "rgba(128,165,222,.2)"} />)}
                </g>
                {layout.links.map(renderLink)}
                {nodes.map(renderNode)}
              </g>
            </svg>
          </div>
          {mode && statusMsg && !loading && (
              <div className={styles.empty} role="status">
                <b>{mode === "college" ? "추천 학과" : "추천 직무"} 준비 중</b>{statusMsg}
                {!demo && <div style={{ marginTop: 10 }}><Link className="btn sm" href="/graph?demo=1">시연 모드로 예시 보기</Link></div>}
              </div>
            )}

          <div className={"loading" + (loading ? "" : " hidden")} aria-live="polite">
            <div>
              <div className="orbit"><i /><i /><i /></div>
              <h2>{demo ? "예시 데이터로 연결을 그리고 있어요…" : "내 프로젝트 기록으로 연결을 그리고 있어요…"}</h2>
              <p>{LOADING_STEPS[step]}…</p>
              <div className="steps">{LOADING_STEPS.map((t, i) => <span key={t} className={i === step ? "on" : ""}>{t}</span>)}</div>
            </div>
          </div>

          <div className={"decision" + (mode ? " hidden" : "")}>
            <div className="decision-inner">
              <h2>어느 쪽이 더 궁금한가요?</h2>
              <p className="lead">언제든 바꿀 수 있어요.</p>
              <div className="choice-grid">
                <button className="choice" onClick={() => chooseMode("college")}><span className="choice-icon">🎓</span><h3>대학 진학</h3><p>내 프로젝트와 이어진 추천 학과 → 대학 보기</p></button>
                <button className="choice" onClick={() => chooseMode("career")}><span className="choice-icon">💼</span><h3>취업</h3><p>내 강점과 맞는 직무·채용공고 보기</p></button>
              </div>
            </div>
          </div>

          <div className="legend">
            <span><i style={{ background: COLORS.recommend }} />추천 학과·직무</span>
            <span><i style={{ background: COLORS.target }} />{demo ? "추천 대학" : "개설 대학"}</span>
            <span><i style={{ background: COLORS.posting }} />채용공고</span>
            <span><i style={{ background: "#fff", border: "2px solid #80A5DE" }} />준비 정보</span>
            <span><i className="sq" />프로젝트</span>
            <span><i className="nt" />내 노트</span>
          </div>
          <div className="zoom">
            <button onClick={() => zoomBy(1.3)} aria-label="확대">+</button>
            <button onClick={() => zoomBy(1 / 1.3)} aria-label="축소">−</button>
            <button onClick={() => { setInstant(false); fit(); }} aria-label="전체 보기" title="전체 보기">⤢</button>
          </div>
        </section>

        <aside className="lm-panel" aria-live="polite">
          {dockNote ? (
            <NotePanel note={dockNote} projects={projects} onProject={openProject} />
          ) : dockProject ? (
            <ProjectPanel project={dockProject} notes={noteCount(dockProject.id)} onAdd={() => setAdding([dockProject.id])} />
          ) : !mode || !cur ? (
            <>
              <div className="panel-label">연결 그래프</div>
              <h2>어느 쪽이 궁금한가요?</h2>
              <p className="desc">대학 진학이나 취업을 고르면 내 프로젝트와 이어진 추천 학과·직무가 펼쳐져요.</p>
              <h3 className="section-title">내 프로젝트</h3>
              <ProjectRows ids={projects.map((p) => p.id)} projects={projects} noteCount={noteCount} onOpen={openProject} />
              {!projects.length && <p className="panel-hint">아직 프로젝트가 없어요. <Link href="/projects" style={{ color: "var(--primary)", fontWeight: 700 }}>프로젝트 관리</Link>에서 먼저 만들어 주세요.</p>}
              {demo && <Notice type="mock" />}
            </>
          ) : (
            <ExplorePanel
              node={selNode && selNode.kind !== "root" ? selNode : cur}
              current={cur}
              data={data}
              mode={mode}
              path={path}
              projects={projects}
              noteCount={noteCount}
              onPick={selectNode}
              onProject={openProject}
              onPostings={(jobId, hi) => { if (path[0] !== jobId) { const n = findNode(data, mode, jobId); if (n) selectNode(n); } setPostings({ jobId, hi }); scrollTo("exPostings"); }}
              onTemplate={(tpl) => router.push(`/portfolio?type=${tpl}&step=2`)}
              scrapInput={scrapInput}
              statusMsg={statusMsg}
            />
          )}
        </aside>
      </div>

      {postings && mode === "career" && (
        <Postings data={data} jobId={postings.jobId} hi={postings.hi} onClose={() => setPostings(null)} />
      )}

      <div id="exDock">
        {dockNote && (
          <NoteDock key={dockNote.id} note={dockNote} projects={projects} loc={loc}
            onChange={(n) => setNotes((list) => list.map((x) => (x.id === n.id ? n : x)))}
            onDeleted={(id) => { setNotes((list) => list.filter((x) => x.id !== id)); setDock(null); }}
            onClose={() => setDock(null)} />
        )}
        {dockProject && (
          <ProjectDock project={dockProject} notes={notes.filter((n) => n.project_ids.includes(dockProject.id))} loc={loc}
            onOpenNote={openNote} onAdd={() => setAdding([dockProject.id])} onClose={() => setDock(null)} />
        )}
      </div>

      {adding && (
        <AddGraphNoteModal projects={projects} preset={adding} onCreate={addNote} onClose={() => setAdding(null)} />
      )}
    </>
  );
}

// ───────── 오른쪽 패널 ─────────

function ProjectRows({ ids, projects, noteCount, onOpen }: { ids: string[]; projects: GraphProject[]; noteCount: (pid: string) => number; onOpen: (pid: string) => void }) {
  const list = ids.map((id) => projects.find((p) => p.id === id)).filter((p): p is GraphProject => !!p);
  if (!list.length) return null;
  return (
    <div className="next-list">
      {list.map((p) => (
        <button key={p.id} className="next-btn" onClick={() => onOpen(p.id)}><i className="sq" />{p.title}<small>노트 {noteCount(p.id)}</small></button>
      ))}
    </div>
  );
}

function dot(kind: ExNode["kind"]) {
  if (kind === "info") return <i style={{ background: "#fff", border: "2px solid #80A5DE" }} />;
  return <i style={{ background: COLORS[kind] ?? COLORS.recommend }} />;
}

interface PanelProps {
  node: ExNode;
  current: ExNode;
  data: ExploreData;
  mode: Mode;
  path: string[];
  projects: GraphProject[];
  noteCount: (pid: string) => number;
  onPick: (n: ExNode) => void;
  onProject: (pid: string) => void;
  onPostings: (jobId: string, hi: string | null) => void;
  onTemplate: (tpl: string) => void;
  scrapInput: (n: ExNode) => ScrapInput | null;
  statusMsg: string | null;
}

function ExplorePanel({ node, current, data, mode, path, projects, noteCount, onPick, onProject, onPostings, onTemplate, scrapInput, statusMsg }: PanelProps) {
  const { scrapOf, readOnly } = useStudent();
  const demo = data.demo;
  if (node.kind === "posting" && node.posting) {
    const o = node.posting;
    return (
      <>
        <div className="panel-label">채용공고 (예시)</div>
        <h2>{o.company}</h2>
        <p className="desc">{o.title} · {o.location} · 마감 {o.deadline}</p>
        <Notice type="job" />
        <div className="panel-scrap"><button className="scrap-btn" disabled title="시연 모드에서는 스크랩할 수 없어요"><Icon name="star" /></button><span>시연 모드에서는 스크랩을 저장하지 않아요</span></div>
        <h3 className="section-title">한 줄 요약</h3>
        <p className="desc">{o.summary}</p>
        <div className="panel-btns"><button className="btn sm primary" onClick={() => onPostings(node.parentId!, node.id)}>목록에서 자세히 보기</button></div>
        <TodoList todoKey={"posting:" + node.id} defaults={CHECKLIST.posting} />
        <Notice type="mock" />
      </>
    );
  }
  const isJob = node.kind === "recommend" && mode === "career";
  const isMajor = node.kind === "recommend" && mode === "college";
  const isSchool = node.kind === "target";
  const kids = node.id === current.id ? childrenOf(data, mode, path) : [];
  const nextList = kids.filter((n) => n.kind !== "info");
  const infos = INFO_LEAVES[mode];
  const pids = node.kind === "info" || node.kind === "posting" ? [] : node.evidence;
  const scrap = scrapInput(node);
  const scrapped = scrap ? !!scrapOf(scrap.type, scrap.ref_id) : false;
  const kindLabel = { root: "탐색 시작", recommend: isMajor ? "추천 학과" : "추천 직무", target: demo ? "추천 대학" : "개설 대학", info: "준비 정보", posting: "채용공고 (예시)" }[node.kind];
  const nextTitle = node.kind === "root" ? (mode === "college" ? "추천 학과" : "추천 직무") : isMajor ? (demo ? "추천 대학" : "개설 대학") : isJob ? (demo ? "채용공고 (예시)" : "채용공고") : "다음 선택";
  return (
    <>
      <div className="panel-label">{kindLabel}</div>
      <h2>{node.label}</h2>
      <p className="desc">{node.desc || (node.kind === "info" ? node.sub + " · 이 단계에서 챙길 준비 항목이에요." : node.sub)}</p>

      {demo && node.kind !== "info" && <Notice type="mock" />}
      {!demo && (node.kind === "root" || node.kind === "recommend") && <Notice type="score" />}
      {(isMajor || isSchool) && <Notice type="school" />}
      {statusMsg && node.kind === "root" && <div className={styles.statusBox}><b>추천 준비 중</b><br />{statusMsg}</div>}
      {demo && (isSchool || isJob) && (
        <div className="panel-scrap"><button className="scrap-btn" disabled title="시연 모드에서는 스크랩할 수 없어요"><Icon name="star" /></button><span>시연 모드에서는 스크랩을 저장하지 않아요</span></div>
      )}
      {scrap && (
        <div className="panel-scrap">
          {readOnly ? <button className="scrap-btn" disabled title="시연 모드에서는 스크랩할 수 없어요"><Icon name="star" /></button> : <ScrapButton input={scrap} />}
          <span>{readOnly ? "시연 모드에서는 스크랩을 저장하지 않아요" : scrapped ? "스크랩했어요 · 스크랩 메뉴에서 다시 볼 수 있어요" : "스크랩해 두고 나중에 다시 보기"}</span>
        </div>
      )}

      {node.score != null && (
        <div className="score-card">
          <div className="score-top"><b>{demo ? "연결도" : "일치도"} <em>{demo ? "샘플" : "점수표"}</em></b><span>{node.score}{demo ? "%" : ""}</span></div>
          <div className="bar"><i style={{ width: Math.min(100, node.score) + "%" }} /></div>
          {node.breadth != null && <p className="panel-hint" style={{ marginTop: 6 }}>넓이 {node.breadth} · 깊이 {node.depth} (각 50%)</p>}
        </div>
      )}

      {node.id === current.id && (nextList.length > 0 || isJob || isMajor) && (
        <>
          <h3 className="section-title">{nextTitle}</h3>
          {nextList.length ? (
            <div className="next-list">
              {nextList.map((n) => (
                <button key={n.id} className="next-btn" onClick={() => onPick(n)}>{dot(n.kind)}{n.label}{n.sub && <small>{n.sub}</small>}</button>
              ))}
            </div>
          ) : (
            <div className={styles.statusBox}>
              {isJob ? "채용공고 데이터는 아직 연결되지 않았어요. 공고 수집 기능이 생기면 여기에 표시돼요." : "이 학과의 개설 대학 데이터가 아직 없어요 (universities)."}
            </div>
          )}
          {isJob && demo && <div className="panel-btns"><button className="btn sm primary" onClick={() => onPostings(node.id, null)}>채용공고 목록으로 이동</button></div>}
        </>
      )}

      {pids.length > 0 && (
        <>
          <h3 className="section-title">{node.kind === "root" ? "내 프로젝트" : "연결된 프로젝트"}</h3>
          <ProjectRows ids={pids} projects={projects} noteCount={noteCount} onOpen={onProject} />
        </>
      )}
      {(isSchool || isJob) && (
        <>
          <h3 className="section-title">준비 정보</h3>
          <div className="next-list">
            {infos.map((n) => <button key={n.id} className="next-btn" onClick={() => onPick(n)}>{dot(n.kind)}{n.label}<small>{n.sub}</small></button>)}
          </div>
        </>
      )}
      {node.tags && node.tags.length > 0 && (
        <>
          <h3 className="section-title">{demo ? "강점 키워드" : "채운 점수표 칸 (내 기록의 태그)"}</h3>
          <div className="tags">{node.tags.map((t) => <span key={t} className="tag">{t}</span>)}</div>
        </>
      )}
      {!demo && node.url && <div className="panel-btns"><a className="btn sm" href={node.url} target="_blank" rel="noreferrer">대학 홈페이지</a></div>}

      {node.kind === "info" && (
        <>
          <div className="panel-btns">
            {node.tpl && <button className="btn sm primary" onClick={() => onTemplate(node.tpl!)}><Icon name="file" />{node.tpl === "altform-dongguk-2027" ? "학교생활기록부 대체서식" : "프로젝트 포트폴리오"} 만들기</button>}
            <button className="btn sm" onClick={() => onPick(current)}>← {current.label}</button>
          </div>
          {node.tpl && <Notice type={node.tpl.startsWith("altform") ? "form" : "noai"} />}
          {node.action === "todo" && current.kind !== "root" && (
            <TodoList todoKey={(current.kind === "target" ? "university:" : "job:") + current.id}
              defaults={current.kind === "target" ? CHECKLIST.university : CHECKLIST.job} title={current.label + " 준비 체크리스트"} />
          )}
        </>
      )}
      {isSchool && <TodoList todoKey={"university:" + node.id} defaults={CHECKLIST.university} />}
      {isMajor && <TodoList todoKey={"major:" + node.id} defaults={CHECKLIST.major} />}
      {isJob && <TodoList todoKey={"job:" + node.id} defaults={CHECKLIST.job} />}
      {demo && <Notice type="mock" />}
    </>
  );
}

function ProjectPanel({ project, notes, onAdd }: { project: GraphProject; notes: number; onAdd: () => void }) {
  return (
    <>
      <div className="panel-label">프로젝트</div>
      <h2>{project.title}</h2>
      <p className="desc">{[project.topic, project.start_date ? ym(project.start_date) + (project.end_date ? " – " + ym(project.end_date) : "") : "", STATUS_LABEL[project.status]].filter(Boolean).join(" · ")}</p>
      <div className="tags" style={{ marginTop: 12 }}><span className="tag">자료 {project.record_count}개</span><span className="tag">연결 노트 {notes}개</span></div>
      <div className="panel-btns">
        <button className="btn sm primary" onClick={onAdd}><Icon name="plus" />노트 추가</button>
        <Link className="btn sm" href={`/projects/${project.id}?tab=gnotes`}>프로젝트 관리</Link>
      </div>
      <p className="panel-hint">연결된 노트는 그래프 아래에 모여 있어요.</p>
    </>
  );
}

function NotePanel({ note, projects, onProject }: { note: GraphNote; projects: GraphProject[]; onProject: (pid: string) => void }) {
  return (
    <>
      <div className="panel-label">내 노트</div>
      <h2>{note.title || "제목 없음"}</h2>
      <p className="desc">그래프 아래에서 바로 고칠 수 있어요.</p>
      <h3 className="section-title">연결된 프로젝트</h3>
      {note.project_ids.length ? (
        <div className="next-list">
          {note.project_ids.map((pid) => {
            const p = projects.find((x) => x.id === pid);
            return p ? <button key={pid} className="next-btn" onClick={() => onProject(pid)}><i className="sq" />{p.title}</button> : null;
          })}
        </div>
      ) : <div className="hint">연결된 프로젝트가 없어요.</div>}
      <p className="panel-hint">노트 노드를 끌어서 위치를 옮길 수 있어요.</p>
    </>
  );
}

// ───────── 채용공고 목록 (시연 모드에서만 데이터가 있다) ─────────

function Postings({ data, jobId, hi, onClose }: { data: ExploreData; jobId: string; hi: string | null; onClose: () => void }) {
  const job = data.career.children.find((j) => j.id === jobId);
  const list = data.career.next[jobId] ?? [];
  if (!job) return null;
  return (
    <section id="exPostings" className="postings" aria-label="채용공고 목록">
      <div className="ph">
        <span className="nd-kind proj"><i />채용공고</span>
        <h3>{job.label} <small>{data.demo ? `${list.length}건 · 예시` : "준비 중"}</small></h3>
        <button className="icon-btn" onClick={onClose} aria-label="닫기"><Icon name="x" /></button>
      </div>
      {data.demo ? (
        <>
          <Notice type="mock" extra="실제 공고는 원문을 직접 확인하세요." />
          <Notice type="job" />
          {list.map((n) => n.posting && (
            <details key={n.id} className={"posting" + (n.id === hi ? " on" : "")} open={n.id === hi}>
              <summary>
                <span className="co">{n.posting.company}</span><span className="tt">{n.posting.title}</span>
                <span className="mt">{n.posting.location} · 마감 {n.posting.deadline}</span>
              </summary>
              <div className="pb">
                <h5>요약</h5><p>{n.posting.summary}</p>
                <h5>자격 요건</h5><ul>{n.posting.requirements.map((r) => <li key={r}>{r}</li>)}</ul>
                {n.posting.preferred.length > 0 && <><h5>우대 사항</h5><ul>{n.posting.preferred.map((r) => <li key={r}>{r}</li>)}</ul></>}
                <h5>내 메모 <span className="hint">· 시연 모드에서는 저장하지 않아요</span></h5>
                <textarea className="memo" disabled placeholder="실제 채용공고가 연결되면 메모를 남길 수 있어요." />
                <TodoList todoKey={"posting:" + n.id} defaults={CHECKLIST.posting} />
                <div className="pf2"><span>· 예시 데이터라 원문 링크가 없어요</span></div>
              </div>
            </details>
          ))}
        </>
      ) : (
        <div className={styles.statusBox}>
          <b>채용공고 데이터는 아직 연결되지 않았어요.</b><br />
          서버에 채용공고 표와 수집 기능이 생기면 이 직무의 공고가 여기에 모여요. 지금은 준비 정보와 체크리스트로 준비할 일을 정리해 보세요.
        </div>
      )}
    </section>
  );
}
