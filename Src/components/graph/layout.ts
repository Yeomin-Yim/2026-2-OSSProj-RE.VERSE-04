// 연결 그래프 배치 계산 (화면 전용, 외부 라이브러리 없음).
// 프로젝트 수가 많지 않아서(수십 개) 간단한 힘-배치(Fruchterman–Reingold)를 한 번에 끝까지 돌린다.
// 같은 입력이면 항상 같은 위치가 나온다 (난수 없음) → 새로고침해도 그림이 흔들리지 않는다.
// 이 점수·연결은 서버가 계산한 값을 그대로 받아 위치만 정한다. 점수를 새로 만들지 않는다.

export interface LayoutNode {
  id: string;
  r: number;
}

export interface LayoutEdge {
  a: string;
  b: string;
  /** 서버가 계산한 유사도 (0~1). 클수록 가깝게 끈다 */
  score: number;
}

export type Point = { x: number; y: number };

/** 노드 아래 이름표가 들어갈 여유 */
const LABEL_SPACE = 30;
/** 그림 둘레 여백: 위는 도구 막대, 아래는 범례가 겹치지 않게 */
const PAD = { top: 64, bottom: 58, side: 40 };
/** 프로젝트가 적을 때 너무 크게 벌리지 않는다 */
const MAX_FIT = 1.25;

export function layoutGraph(nodes: LayoutNode[], edges: LayoutEdge[], width: number, height: number): Map<string, Point> {
  const pos = new Map<string, Point>();
  const n = nodes.length;
  if (!n) return pos;

  const cx = width / 2;
  const cy = height / 2;

  if (n === 1) {
    pos.set(nodes[0].id, { x: cx, y: cy });
    return pos;
  }

  // 시작 위치: 해바라기 나선 (겹치지 않고 고르게 퍼진다)
  const spread = Math.min(width, height) * 0.38;
  const P = nodes.map((node, i) => {
    const t = Math.sqrt((i + 0.5) / n);
    const angle = i * 2.399963; // 황금각
    return { id: node.id, r: node.r, x: cx + Math.cos(angle) * spread * t, y: cy + Math.sin(angle) * spread * t, dx: 0, dy: 0 };
  });
  const index = new Map(P.map((p, i) => [p.id, i]));
  const links = edges
    .map((e) => ({ s: index.get(e.a), t: index.get(e.b), w: e.score }))
    .filter((l): l is { s: number; t: number; w: number } => l.s !== undefined && l.t !== undefined);
  const degree = new Array(n).fill(0);
  for (const l of links) { degree[l.s]++; degree[l.t]++; }

  const k = Math.sqrt((width * height) / n) * 0.62; // 이상적인 간격
  const ITER = 360;
  let temp = Math.min(width, height) / 6;

  for (let it = 0; it < ITER; it++) {
    for (const p of P) { p.dx = 0; p.dy = 0; }

    // 밀어내기 (모든 쌍) + 겹침 방지
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = P[i], b = P[j];
        let dx = a.x - b.x, dy = a.y - b.y;
        let d = Math.hypot(dx, dy);
        if (d < 0.01) { dx = (i - j) * 0.1 + 0.05; dy = 0.07; d = Math.hypot(dx, dy); }
        const min = a.r + b.r + LABEL_SPACE;
        let f = (k * k) / d;
        if (d < min) f += (min - d) * 6;
        const ux = dx / d, uy = dy / d;
        a.dx += ux * f; a.dy += uy * f;
        b.dx -= ux * f; b.dy -= uy * f;
      }
    }

    // 끌어당기기 (연결선). 유사도가 높을수록 세게
    for (const l of links) {
      const a = P[l.s], b = P[l.t];
      const dx = a.x - b.x, dy = a.y - b.y;
      const d = Math.max(Math.hypot(dx, dy), 0.01);
      const f = ((d * d) / k) * (0.35 + l.w * 1.6);
      const ux = dx / d, uy = dy / d;
      a.dx -= ux * f; a.dy -= uy * f;
      b.dx += ux * f; b.dy += uy * f;
    }

    // 가운데로 모으기. 연결이 없는 프로젝트가 화면 밖으로 밀려나지 않게 조금 더 세게
    for (let i = 0; i < n; i++) {
      const p = P[i];
      const g = degree[i] ? 0.04 : 0.07;
      p.dx += (cx - p.x) * g * k * 0.05;
      p.dy += (cy - p.y) * g * k * 0.05 * (width / height); // 가로로 긴 화면에 맞게 세로를 더 조인다
    }

    for (const p of P) {
      const d = Math.hypot(p.dx, p.dy);
      if (d > 0) {
        const step = Math.min(d, temp);
        p.x += (p.dx / d) * step;
        p.y += (p.dy / d) * step;
      }
    }
    temp = Math.max(temp * 0.985, 0.5);
  }

  // 돌려 맞추기: 점들이 길게 퍼진 방향(주축)을 화면의 긴 쪽에 맞춘다 (세로로 긴 휴대폰 화면에서 겹침을 줄인다)
  //   연결 없는 점은 멀리 흩어져 방향을 흐리므로, 연결된 점이 2개 이상이면 그것들로만 방향을 잰다
  const linked = P.filter((_, i) => degree[i] > 0);
  const basis = linked.length >= 2 ? linked : P;
  const mx = P.reduce((s, p) => s + p.x, 0) / n, my = P.reduce((s, p) => s + p.y, 0) / n;
  const bx = basis.reduce((s, p) => s + p.x, 0) / basis.length, by = basis.reduce((s, p) => s + p.y, 0) / basis.length;
  let sxx = 0, syy = 0, sxy = 0;
  for (const p of basis) { sxx += (p.x - bx) ** 2; syy += (p.y - by) ** 2; sxy += (p.x - bx) * (p.y - by); }
  const axis = 0.5 * Math.atan2(2 * sxy, sxx - syy); // 주축 각도
  const turn = (width >= height ? 0 : Math.PI / 2) - axis;
  const cos = Math.cos(turn), sin = Math.sin(turn);
  for (const p of P) {
    const dx = p.x - mx, dy = p.y - my;
    p.x = mx + dx * cos - dy * sin;
    p.y = my + dx * sin + dy * cos;
  }

  // 화면에 맞추기: 경계에 부딪히며 계산하지 않고, 다 놓은 뒤 전체를 여백 안으로 줄이거나 늘린다 (점 크기는 그대로)
  //   가로·세로를 따로 맞추되 한쪽만 지나치게 늘어나지 않게 비율을 2.5배 안으로 묶는다
  const maxR = Math.max(...P.map((p) => p.r));
  const minX = Math.min(...P.map((p) => p.x)), maxX = Math.max(...P.map((p) => p.x));
  const minY = Math.min(...P.map((p) => p.y)), maxY = Math.max(...P.map((p) => p.y));
  const left = PAD.side + maxR, right = width - PAD.side - maxR;
  const top = PAD.top + maxR, bottom = height - PAD.bottom - maxR - LABEL_SPACE;
  let sx = Math.min((right - left) / Math.max(1, maxX - minX), MAX_FIT);
  let sy = Math.min((bottom - top) / Math.max(1, maxY - minY), MAX_FIT);
  sx = Math.min(sx, sy * 2.5);
  sy = Math.min(sy, sx * 2.5);
  const midX = (minX + maxX) / 2, midY = (minY + maxY) / 2;
  const toX = (left + right) / 2, toY = (top + bottom) / 2;
  for (const p of P) {
    p.x = toX + (p.x - midX) * sx;
    p.y = toY + (p.y - midY) * sy;
  }

  // 마무리: 줄이면서 겹친 점을 살짝 밀어 떼어 놓는다 (이름표 자리 포함). 화면 밖으로는 나가지 않게
  for (let it = 0; it < 120; it++) {
    let moved = false;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = P[i], b = P[j];
        let dx = b.x - a.x, dy = b.y - a.y;
        let d = Math.hypot(dx, dy);
        const min = a.r + b.r + LABEL_SPACE * 0.9;
        if (d >= min) continue;
        if (d < 0.01) { dx = 0.6; dy = 0.8; d = 1; }
        const push = (min - d) / 2 + 0.5;
        const ux = dx / d, uy = dy / d;
        a.x -= ux * push; a.y -= uy * push;
        b.x += ux * push; b.y += uy * push;
        moved = true;
      }
    }
    for (const p of P) {
      p.x = clamp(p.x, PAD.side + p.r, width - PAD.side - p.r);
      p.y = clamp(p.y, PAD.top + p.r, height - PAD.bottom - p.r - LABEL_SPACE / 2);
    }
    if (!moved) break;
  }

  for (const p of P) pos.set(p.id, { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 });
  return pos;
}

const clamp = (v: number, lo: number, hi: number) => (hi < lo ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v)));
