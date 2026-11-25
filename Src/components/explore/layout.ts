// 진로 탐색 그래프 배치 (프로토타입 buildData 를 그대로 옮김, 라이브러리 없음).
//   루트 → (선택 경로) → 자식들을 오른쪽 부채꼴로, 근거 프로젝트는 아래 줄, 노트는 그 아래.
// 같은 입력이면 항상 같은 위치가 나온다.

import type { ExNode, ExploreData } from "@/lib/server/explore/explore";
import type { GraphNote } from "@/lib/server/student/notes";
import { INFO_LEAVES } from "./info.ts";

export type Mode = "college" | "career";
export type LKind = ExNode["kind"] | "project" | "note" | "bg";

export interface LNode {
  id: string;
  kind: LKind;
  label: string;
  sub: string;
  x: number;
  y: number;
  ref?: ExNode;
  pid?: string;
  noteId?: string;
  onPath?: boolean;
  r?: number;
  tone?: number;
}
export interface LLink { s: string; t: string; kind: "path" | "child" | "evidence" | "note" | "bg"; label?: string }

const X0 = -300, STEP = 215, PY = 300, GAP = 210;
export const PN = (pid: string) => "proj:" + pid;

/** 화면에 나오는 모든 탐색 노드 (id 로 찾기) */
export function findNode(data: ExploreData, mode: Mode | null, id: string | null): ExNode | null {
  if (!mode || !id) return null;
  const side = data[mode];
  if (id === side.root.id) return side.root;
  for (const n of side.children) if (n.id === id) return n;
  for (const list of Object.values(side.next)) for (const n of list) if (n.id === id) return n;
  return INFO_LEAVES[mode].find((n) => n.id === id) ?? null;
}

export function currentNode(data: ExploreData, mode: Mode | null, path: string[]): ExNode | null {
  if (!mode) return null;
  if (!path.length) return data[mode].root;
  return findNode(data, mode, path[path.length - 1]) ?? data[mode].root;
}

/** 지금 단계에서 펼쳐지는 다음 선택지 */
export function childrenOf(data: ExploreData, mode: Mode | null, path: string[]): ExNode[] {
  if (!mode) return [];
  const side = data[mode];
  if (!path.length) return side.children;
  const last = findNode(data, mode, path[path.length - 1]);
  if (!last) return [];
  if (last.kind === "recommend" && mode === "college") return side.next[last.id] ?? [];
  if (last.kind === "target") return INFO_LEAVES[mode];
  if (last.kind === "recommend" && mode === "career") return [...(side.next[last.id] ?? []), ...INFO_LEAVES[mode]];
  return [];
}

/** 저장된 경로를 지금 데이터 구조에 맞게 정리한다 (사라진 노드는 버림) */
export function cleanPath(data: ExploreData, mode: Mode | null, path: string[]): string[] {
  if (!mode) return [];
  const ns = path.map((id) => findNode(data, mode, id)).filter((n): n is ExNode => !!n);
  const school = ns.filter((n) => n.kind === "target").pop();
  const rec = ns.filter((n) => n.kind === "recommend").pop();
  if (mode === "college") return school?.parentId ? [school.parentId, school.id] : rec ? [rec.id] : [];
  return rec ? [rec.id] : [];
}

function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 배경의 별자리 (고정 위치) */
export const STARS: { nodes: LNode[]; links: LLink[] } = (() => {
  const rand = rng(7), nodes: LNode[] = [], links: LLink[] = [];
  for (let i = 0; i < 150; i++) {
    nodes.push({ id: "bg" + i, kind: "bg", label: "", sub: "", x: (rand() - 0.5) * 1100, y: (rand() - 0.5) * 860 + 110, r: 1 + rand() * 1.8, tone: rand() });
  }
  nodes.forEach((a, i) => {
    let cnt = 0;
    for (let j = i + 1; j < nodes.length && cnt < 2; j++) {
      const b = nodes[j];
      if (Math.hypot(a.x - b.x, a.y - b.y) < 130 && rand() < 0.55) { links.push({ s: a.id, t: b.id, kind: "bg" }); cnt++; }
    }
  });
  return { nodes, links };
})();

function edgeLabel(n: ExNode, mode: Mode, demo: boolean) {
  if (n.kind === "target") return demo ? "추천 대학" : "개설 대학";
  if (n.kind === "recommend") return mode === "college" ? "추천 학과" : "추천 직무";
  if (n.kind === "posting") return "채용공고";
  if (n.kind === "info") return "준비 정보";
  return "";
}

export interface LayoutInput {
  data: ExploreData;
  mode: Mode | null;
  path: string[];
  projects: { id: string; title: string }[];
  notes: GraphNote[];
  noteCount: (pid: string) => number;
  /** 사용자가 끌어 옮긴 프로젝트 위치 (이 화면에서만) */
  moved: Record<string, { x: number; y: number }>;
}

export function buildLayout({ data, mode, path, projects, notes, noteCount, moved }: LayoutInput) {
  const nodes: LNode[] = [], links: LLink[] = [];
  let focus: LNode | null = null;

  if (mode) {
    const root = data[mode].root;
    const pathNodes = path.map((id) => findNode(data, mode, id)).filter((n): n is ExNode => !!n);
    const kids = childrenOf(data, mode, path).filter((n) => n.id !== root.id && !pathNodes.some((p) => p.id === n.id));
    let prev: LNode = { id: root.id, kind: "root", label: root.label, sub: root.sub, x: X0, y: 0, ref: root, onPath: true };
    nodes.push(prev);
    pathNodes.forEach((n, i) => {
      const x = X0 + STEP * (i + 1);
      const pn: LNode = { id: n.id, kind: n.kind, label: n.label, sub: n.sub, x, y: 0, ref: n, onPath: true };
      nodes.push(pn);
      links.push({ s: prev.id, t: pn.id, kind: "path", label: i === pathNodes.length - 1 ? "선택" : "탐색 흐름" });
      prev = pn;
    });
    const many = kids.length > 6;
    const R = many ? 250 : kids.length > 4 ? 205 : 185;
    const SPREAD = many ? Math.PI * 0.5 : Math.PI * 0.42;
    kids.forEach((n, i) => {
      const a = kids.length === 1 ? 0 : -SPREAD + (SPREAD * 2 * i) / (kids.length - 1);
      nodes.push({ id: n.id, kind: n.kind, label: n.label, sub: n.sub, x: prev.x + Math.cos(a) * R, y: Math.sin(a) * R * 0.8, ref: n });
      links.push({ s: prev.id, t: n.id, kind: "child", label: edgeLabel(n, mode, data.demo) });
    });
    focus = prev;
  }

  // 아래쪽 프로젝트: 시작 화면은 전부, 학과·직무를 고른 뒤에는 그 노드의 근거 프로젝트만
  const vis = !mode ? projects.map((p) => p.id) : !path.length || !focus?.ref ? [] : focus.ref.kind === "info" || focus.ref.kind === "posting" ? [] : focus.ref.evidence;
  const ps = projects.filter((p) => vis.includes(p.id));
  const x0 = (focus && ps.length ? focus.x : 0) - ((ps.length - 1) * GAP) / 2;
  const px: Record<string, { x: number; y: number }> = {};
  ps.forEach((p, i) => {
    const id = PN(p.id), c = moved[id] ?? { x: x0 + i * GAP, y: PY }, cnt = noteCount(p.id);
    px[p.id] = c;
    nodes.push({ id, kind: "project", label: p.title, sub: cnt ? `노트 ${cnt}개` : "프로젝트", pid: p.id, x: c.x, y: c.y });
    if (focus) links.push({ s: focus.id, t: id, kind: "evidence" });
  });

  // 학생 노트: 연결된 프로젝트 아래 (끌어 옮긴 위치는 note.pos)
  const slot: Record<string, number> = {}, OFF = [0, -84, 84, -168, 168];
  for (const n of notes) {
    const pids = n.project_ids.filter((pid) => px[pid]);
    if (!pids.length) continue; // 지금 보이는 프로젝트와 연결되지 않은 노트는 접어 둔다
    let pos = n.pos;
    if (!pos) {
      const key = [...pids].sort().join(",");
      const i = (slot[key] = (slot[key] ?? 0) + 1) - 1;
      const cx = pids.reduce((a, pid) => a + px[pid].x, 0) / pids.length;
      const cy = pids.reduce((a, pid) => a + px[pid].y, 0) / pids.length;
      pos = { x: cx + OFF[i % 5], y: cy + (pids.length > 1 ? 190 : 110) + Math.floor(i / 5) * 62 };
    }
    nodes.push({ id: "note:" + n.id, kind: "note", label: n.title || "제목 없음", sub: "", noteId: n.id, x: pos.x, y: pos.y });
    for (const pid of pids) links.push({ s: "note:" + n.id, t: PN(pid), kind: "note" });
  }

  return { nodes, links, focusId: focus?.id ?? null };
}

export const nodeR = (k: LKind) =>
  k === "root" ? 16 : k === "recommend" ? 13 : k === "target" ? 12 : k === "project" ? 13 : k === "note" ? 11 : k === "posting" ? 10 : 9;

/** 순서대로 나타나는 생성 모션: 루트 → 경로 → 자식 → 프로젝트 → 노트 */
export function revealDelays(nodes: LNode[], only?: Set<string>): Map<string, number> {
  const order: Partial<Record<LKind, number>> = { root: 0, recommend: 2, target: 2, posting: 2, info: 2, project: 3, note: 4 };
  const list = nodes
    .filter((n) => n.kind !== "bg" && (!only || only.has(n.id)))
    .map((n, i) => ({ n, k: (n.onPath ? (n.kind === "root" ? 0 : 1) : order[n.kind] ?? 2) * 1000 + i }))
    .sort((a, b) => a.k - b.k);
  const step = Math.max(90, Math.min(170, (only ? 1400 : 3000) / Math.max(1, list.length)));
  return new Map(list.map((it, i) => [it.n.id, (only ? 60 : 150) + i * step]));
}
