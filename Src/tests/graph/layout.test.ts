import { test } from "node:test";
import assert from "node:assert/strict";
import { layoutGraph } from "../../components/graph/layout.ts";

const W = 800;
const H = 560;
const nodes = Array.from({ length: 12 }, (_, i) => ({ id: `p${i}`, r: 18 }));
const edges = [
  { a: "p0", b: "p1", score: 0.6 },
  { a: "p1", b: "p2", score: 0.3 },
  { a: "p3", b: "p4", score: 0.2 },
];

test("모든 프로젝트(연결 없는 것 포함)에 위치가 생기고 화면 안에 있다", () => {
  const pos = layoutGraph(nodes, edges, W, H);
  assert.equal(pos.size, nodes.length);
  for (const { id, r } of nodes) {
    const p = pos.get(id)!;
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), id);
    assert.ok(p.x >= r && p.x <= W - r, `${id} x=${p.x}`);
    assert.ok(p.y >= r && p.y <= H - r, `${id} y=${p.y}`);
  }
});

test("같은 입력이면 같은 위치 (새로고침해도 흔들리지 않는다)", () => {
  assert.deepEqual([...layoutGraph(nodes, edges, W, H)], [...layoutGraph(nodes, edges, W, H)]);
});

test("점끼리 겹치지 않는다", () => {
  const pos = layoutGraph(nodes, edges, W, H);
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = pos.get(nodes[i].id)!, b = pos.get(nodes[j].id)!;
      assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > nodes[i].r + nodes[j].r, `${nodes[i].id}-${nodes[j].id}`);
    }
  }
});

test("유사도가 높은 쌍이 연결 없는 쌍보다 가깝다", () => {
  const pos = layoutGraph(nodes, edges, W, H);
  const d = (a: string, b: string) => Math.hypot(pos.get(a)!.x - pos.get(b)!.x, pos.get(a)!.y - pos.get(b)!.y);
  assert.ok(d("p0", "p1") < d("p0", "p9"));
});

test("없는 프로젝트를 가리키는 연결은 무시하고, 0·1개도 처리한다", () => {
  assert.equal(layoutGraph([], [], W, H).size, 0);
  assert.deepEqual(layoutGraph([{ id: "x", r: 20 }], [{ a: "x", b: "gone", score: 1 }], W, H).get("x"), { x: W / 2, y: H / 2 });
});
