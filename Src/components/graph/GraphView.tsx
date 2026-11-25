"use client";

// 연결 그래프 (프로토타입 "나의 배움 정리"의 그래프 + 오른쪽 패널 구성)
//   왼쪽: 프로젝트 = 점, 서버가 계산한 연결 = 선 (굵기 = 유사도)
//   오른쪽: 선택한 프로젝트 / 연결의 정보
// 점수·공통 태그·기준값은 서버(analysis_runs)가 계산한 값을 그대로 쓴다. 화면에서 만들지 않는다.
// 그림은 SVG 로 그린다. 외부 그래프 라이브러리를 쓰지 않아 인스턴스·이벤트 정리 문제가 없다.

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { STATUS_LABEL, ym } from "@/components/projects/format";
import type { TagInfo } from "@/components/projects/types";
import { layoutGraph } from "./layout";
import styles from "./GraphView.module.css";

export interface GraphProject {
  id: string;
  title: string;
  topic: string | null;
  status: "active" | "done";
  start_date: string | null;
  end_date: string | null;
  record_count: number;
}

export interface GraphRelation {
  a: string;
  b: string;
  score: number;
  shared: string[];
}

interface Props {
  projects: GraphProject[];
  relations: GraphRelation[];
  threshold: number;
  tagInfo: TagInfo;
}

type Selection = { type: "node"; id: string } | { type: "edge"; key: string } | null;
type View = { k: number; x: number; y: number };

const edgeKey = (r: { a: string; b: string }) => r.a + "|" + r.b;
const nodeRadius = (count: number) => 15 + Math.min(13, Math.sqrt(count) * 3.2);
const short = (s: string, n = 11) => (s.length > n ? s.slice(0, n) + "…" : s);
const fmt = (score: number) => score.toFixed(2);
/** 화면 크기가 조금 바뀔 때마다 다시 배치하지 않도록 40px 단위로 맞춘다 */
const snap = (v: number) => Math.max(240, Math.round(v / 40) * 40);
const MIN_K = 0.5;
const MAX_K = 2.5;

export function GraphView({ projects, relations, threshold, tagInfo }: Props) {
  const stage = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [view, setView] = useState<View>({ k: 1, x: 0, y: 0 });
  const [sel, setSel] = useState<Selection>(null);
  const [showWeak, setShowWeak] = useState(false);
  const drag = useRef<{ id: number; sx: number; sy: number; vx: number; vy: number; moved: boolean } | null>(null);

  // 그림 영역 크기 (ResizeObserver 는 한 번만 만들고 언마운트 때 정리)
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const measure = () => {
      const w = snap(el.clientWidth);
      const h = snap(el.clientHeight);
      setSize((s) => (s.w === w && s.h === h ? s : { w, h }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ───── 데이터 정리: 지금 있는 프로젝트 사이의 연결만 쓴다 (삭제된 프로젝트의 옛 계산 결과 제외)
  const byId = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const valid = useMemo(
    () => relations.filter((r) => byId.has(r.a) && byId.has(r.b)).sort((x, y) => y.score - x.score),
    [relations, byId],
  );
  const strong = useMemo(() => valid.filter((r) => r.score >= threshold), [valid, threshold]);
  const visible = showWeak ? valid : strong;
  const edgeByKey = useMemo(() => new Map(valid.map((r) => [edgeKey(r), r])), [valid]);
  const maxScore = strong[0]?.score ?? threshold;

  /** 프로젝트별 연결 (보이는 선 기준) */
  const neighbors = useMemo(() => {
    const m = new Map<string, GraphRelation[]>();
    for (const r of visible) {
      m.set(r.a, [...(m.get(r.a) ?? []), r]);
      m.set(r.b, [...(m.get(r.b) ?? []), r]);
    }
    return m;
  }, [visible]);
  const strongDegree = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of strong) { m.set(r.a, (m.get(r.a) ?? 0) + 1); m.set(r.b, (m.get(r.b) ?? 0) + 1); }
    return m;
  }, [strong]);
  const isolated = projects.filter((p) => !strongDegree.get(p.id));

  // ───── 배치: 기준을 넘는 연결로만 계산해서, '약한 연결 보기'를 켜도 점이 움직이지 않는다
  const pos = useMemo(
    () => layoutGraph(projects.map((p) => ({ id: p.id, r: nodeRadius(p.record_count) })), strong, size.w, size.h),
    [projects, strong, size.w, size.h],
  );

  // 데이터나 크기가 바뀌면 확대·이동을 처음으로, 사라진 선택은 지운다
  useEffect(() => setView({ k: 1, x: 0, y: 0 }), [pos]);
  useEffect(() => {
    setSel((s) => {
      if (s?.type === "node" && !byId.has(s.id)) return null;
      if (s?.type === "edge" && !edgeByKey.has(s.key)) return null;
      return s;
    });
  }, [byId, edgeByKey]);

  // Esc 로 선택 해제
  useEffect(() => {
    if (!sel) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector(".overlay")) setSel(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sel]);

  const selNode = sel?.type === "node" ? byId.get(sel.id) : undefined;
  const selEdge = sel?.type === "edge" ? edgeByKey.get(sel.key) : undefined;
  // 선택한 프로젝트와 이어진 것만 진하게
  const focusIds = useMemo(() => {
    if (selNode) return new Set([selNode.id, ...(neighbors.get(selNode.id) ?? []).flatMap((r) => [r.a, r.b])]);
    if (selEdge) return new Set([selEdge.a, selEdge.b]);
    return null;
  }, [selNode, selEdge, neighbors]);

  // ───── 확대·이동
  function zoomBy(factor: number) {
    setView((v) => {
      const k = Math.min(MAX_K, Math.max(MIN_K, v.k * factor));
      const cx = size.w / 2, cy = size.h / 2;
      return { k, x: cx - ((cx - v.x) * k) / v.k, y: cy - ((cy - v.y) * k) / v.k };
    });
  }

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    if (e.button !== 0 || (e.target as Element).closest("[data-hit]")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y, moved: false };
  }
  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const scale = size.w / e.currentTarget.getBoundingClientRect().width || 1;
    const dx = (e.clientX - d.sx) * scale, dy = (e.clientY - d.sy) * scale;
    if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
    if (d.moved) setView((v) => ({ ...v, x: d.vx + dx, y: d.vy + dy }));
  }
  function onPointerUp(e: React.PointerEvent<SVGSVGElement>) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (!d.moved) setSel(null); // 빈 곳을 누르면 선택 해제
  }

  const selectNode = (id: string) => setSel({ type: "node", id });
  const selectEdge = (r: GraphRelation) => setSel({ type: "edge", key: edgeKey(r) });
  const title = (id: string) => byId.get(id)?.title ?? "";
  const other = (r: GraphRelation, id: string) => (r.a === id ? r.b : r.a);

  // ───── 빈 화면: 프로젝트가 없음
  if (!projects.length) {
    return (
      <div className={`card ${styles.empty}`}>
        <Icon name="graph" />
        <h2>아직 프로젝트가 없어요</h2>
        <p>프로젝트를 만들고 기록을 남기면, 공통 태그를 바탕으로 프로젝트 사이의 연결을 그려 드려요.</p>
        <Link className="btn primary" href="/projects">프로젝트 관리로 가기</Link>
      </div>
    );
  }

  return (
    <div className="lm">
      <div className={`workspace ${styles.workspace}`}>
        {/* ───── 왼쪽: 그림 */}
        <div className="graph-shell">
          <div className="graph-toolbar">
            <label className={styles.weakToggle}>
              <input type="checkbox" checked={showWeak} onChange={(e) => setShowWeak(e.target.checked)} disabled={valid.length === strong.length} />
              기준 미만 연결도 보기
              <span className={styles.weakCount}>{valid.length - strong.length}</span>
            </label>
            {strong.length === 0 && (
              <div className={styles.notice} role="status">
                {valid.length
                  ? `기준(${fmt(threshold)})을 넘는 연결이 아직 없어요. 옆의 '기준 미만 연결도 보기'로 약한 연결을 볼 수 있어요.`
                  : "아직 계산된 연결이 없어요. 기록을 남기면 공통 태그로 연결을 계산해요."}
              </div>
            )}
          </div>

          <div ref={stage} className={styles.stage}>
            <svg
              className={styles.svg}
              viewBox={`0 0 ${size.w} ${size.h}`}
              preserveAspectRatio="xMidYMid meet"
              role="img"
              aria-label={`프로젝트 ${projects.length}개, 기준 이상 연결 ${strong.length}개`}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={() => (drag.current = null)}
            >
              <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
                {/* 선 */}
                {visible.map((r) => {
                  const a = pos.get(r.a), b = pos.get(r.b);
                  if (!a || !b) return null;
                  const key = edgeKey(r);
                  const weak = r.score < threshold;
                  const on = sel?.type === "edge" && sel.key === key;
                  const dim = focusIds && !(focusIds.has(r.a) && focusIds.has(r.b));
                  const width = weak ? 1.2 : 1.8 + 5.5 * (r.score / (maxScore || 1));
                  return (
                    <g key={key} className={styles.edge + (dim ? " " + styles.dim : "")} data-hit onClick={() => selectEdge(r)}>
                      <title>{`${title(r.a)} ↔ ${title(r.b)} · 유사도 ${fmt(r.score)}`}</title>
                      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={styles.edgeHit} />
                      <line
                        x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                        className={weak ? styles.edgeWeak : on ? styles.edgeOn : styles.edgeLine}
                        strokeWidth={on ? width + 1.5 : width}
                        strokeOpacity={weak || on ? undefined : 0.35 + 0.55 * (r.score / (maxScore || 1))}
                      />
                      {on && (
                        <g transform={`translate(${(a.x + b.x) / 2} ${(a.y + b.y) / 2})`}>
                          <rect x={-22} y={-11} width={44} height={22} rx={11} className={styles.edgeBadge} />
                          <text textAnchor="middle" dy="4" className={styles.edgeBadgeText}>{fmt(r.score)}</text>
                        </g>
                      )}
                    </g>
                  );
                })}

                {/* 점 */}
                {projects.map((p) => {
                  const pt = pos.get(p.id);
                  if (!pt) return null;
                  const r = nodeRadius(p.record_count);
                  const on = sel?.type === "node" && sel.id === p.id;
                  const dim = focusIds && !focusIds.has(p.id);
                  const degree = strongDegree.get(p.id) ?? 0;
                  return (
                    <g
                      key={p.id}
                      data-hit
                      className={[styles.node, p.status === "done" ? styles.done : "", on ? styles.on : "", dim ? styles.dim : "", degree ? "" : styles.alone].join(" ")}
                      transform={`translate(${pt.x} ${pt.y})`}
                      role="button"
                      tabIndex={0}
                      aria-pressed={on}
                      aria-label={`${p.title}, ${STATUS_LABEL[p.status]}, 자료 ${p.record_count}개, 연결 ${degree}개`}
                      onClick={() => selectNode(p.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectNode(p.id); }
                      }}
                    >
                      <title>{`${p.title} · 자료 ${p.record_count}개`}</title>
                      <circle r={r + 6} className={styles.ring} />
                      <circle r={r} className={styles.dot} />
                      <text dy="4" textAnchor="middle" className={styles.count}>{p.record_count}</text>
                      <text y={r + 16} textAnchor="middle" className={styles.label}>{short(p.title)}</text>
                    </g>
                  );
                })}
              </g>
            </svg>
          </div>

          <div className="legend">
            <span><i style={{ background: "var(--primary)" }} />진행 중</span>
            <span><i style={{ background: "var(--sky)" }} />완료</span>
            <span><i className={styles.legendLine} />선이 굵을수록 유사도 높음</span>
            <span>점 안 숫자 = 자료 수</span>
          </div>

          <div className="zoom" aria-label="확대·축소">
            <button type="button" onClick={() => zoomBy(1.25)} aria-label="확대">+</button>
            <button type="button" onClick={() => zoomBy(0.8)} aria-label="축소">−</button>
            <button type="button" onClick={() => setView({ k: 1, x: 0, y: 0 })} aria-label="원래 크기로" title="원래 크기로">⟲</button>
          </div>
        </div>

        {/* ───── 오른쪽: 상세 */}
        <aside className="lm-panel" aria-live="polite">
          {selNode ? (
            <>
              <div className="panel-label">프로젝트</div>
              <h2>{selNode.title}</h2>
              {selNode.topic && <p className="desc">{selNode.topic}</p>}
              <div className={styles.meta}>
                <span className={styles.badge + (selNode.status === "done" ? " " + styles.badgeDone : "")}>{STATUS_LABEL[selNode.status]}</span>
                {selNode.start_date && <span>{ym(selNode.start_date)}{selNode.end_date ? "–" + ym(selNode.end_date) : ""}</span>}
                <span>자료 {selNode.record_count}개</span>
              </div>

              <div className="section-title">연결된 프로젝트</div>
              {(neighbors.get(selNode.id) ?? []).length ? (
                <div className="next-list">
                  {(neighbors.get(selNode.id) ?? []).map((r) => (
                    <button key={edgeKey(r)} type="button" className="next-btn" onClick={() => selectEdge(r)}>
                      <i style={{ background: r.score >= threshold ? "var(--primary)" : "#A9B8D0" }} />
                      {title(other(r, selNode.id))}
                      <small>{fmt(r.score)}{r.score < threshold ? " · 기준 미만" : ""}</small>
                    </button>
                  ))}
                </div>
              ) : (
                <p className={styles.muted}>
                  기준({fmt(threshold)})을 넘는 연결이 아직 없어요. 기록이 쌓이면 다시 계산돼요.
                </p>
              )}

              <div className="panel-btns">
                <Link className="btn primary" href={`/projects/${selNode.id}`}>프로젝트 열기 <Icon name="chevR" /></Link>
                <button type="button" className="btn" onClick={() => setSel(null)}>선택 해제</button>
              </div>
            </>
          ) : selEdge ? (
            <>
              <div className="panel-label">연결</div>
              <h2 className={styles.pair}>
                <button type="button" onClick={() => selectNode(selEdge.a)}>{title(selEdge.a)}</button>
                <span aria-hidden="true">↔</span>
                <button type="button" onClick={() => selectNode(selEdge.b)}>{title(selEdge.b)}</button>
              </h2>
              <div className="score-card">
                <div className="score-top">
                  <span className={styles.scoreLabel}>유사도</span>
                  <span>{fmt(selEdge.score)}</span>
                </div>
                <div className={`bar ${styles.bar}`}>
                  <i style={{ width: `${Math.min(100, selEdge.score * 100)}%` }} />
                  <b style={{ left: `${Math.min(100, threshold * 100)}%` }} title={`기준 ${fmt(threshold)}`} />
                </div>
                <p className={styles.muted}>
                  {selEdge.score >= threshold ? `기준 ${fmt(threshold)} 이상이라 연결선으로 표시해요.` : `기준 ${fmt(threshold)}보다 낮은 약한 연결이에요.`}
                </p>
              </div>

              <div className="section-title">공통 태그 {selEdge.shared.length}개 <span className={styles.muted}>· 무게가 큰 태그부터</span></div>
              <div>
                {selEdge.shared.map((code) => (
                  <span key={code} className={"tag-chip " + (tagInfo[code]?.group ?? "")}>{tagInfo[code]?.label ?? code}</span>
                ))}
              </div>

              <div className="panel-btns">
                <Link className="btn" href={`/projects/${selEdge.a}`}>{short(title(selEdge.a), 9)} 열기</Link>
                <Link className="btn" href={`/projects/${selEdge.b}`}>{short(title(selEdge.b), 9)} 열기</Link>
              </div>
            </>
          ) : (
            <>
              <div className="panel-label">연결 요약</div>
              <h2>내 프로젝트 연결</h2>
              <p className="desc">
                기록에서 찾은 태그가 겹치는 정도로 유사도를 계산해요. 유사도가 <b>{fmt(threshold)}</b> 이상인 프로젝트를 선으로 이었고, 선이 굵을수록 더 비슷해요.
              </p>
              <div className={styles.stats}>
                <div><b>{projects.length}</b><span>프로젝트</span></div>
                <div><b>{strong.length}</b><span>연결</span></div>
                <div><b>{isolated.length}</b><span>연결 없음</span></div>
              </div>

              {strong.length > 0 && (
                <>
                  <div className="section-title">가장 가까운 연결</div>
                  <div className="next-list">
                    {strong.slice(0, 6).map((r) => (
                      <button key={edgeKey(r)} type="button" className="next-btn" onClick={() => selectEdge(r)}>
                        <span className={styles.pairText}>{title(r.a)} ↔ {title(r.b)}</span>
                        <small>{fmt(r.score)}</small>
                      </button>
                    ))}
                  </div>
                </>
              )}

              {isolated.length > 0 && (
                <>
                  <div className="section-title">아직 연결이 없는 프로젝트</div>
                  <div className={styles.chips}>
                    {isolated.map((p) => (
                      <button key={p.id} type="button" className="pchip" onClick={() => selectNode(p.id)}>{p.title}</button>
                    ))}
                  </div>
                </>
              )}

              <p className="panel-hint">점이나 선을 누르면 자세한 내용을 볼 수 있어요. 키보드는 Tab으로 점을 고르고 Enter, 해제는 Esc.</p>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
