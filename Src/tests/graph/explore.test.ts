import { test } from "node:test";
import assert from "node:assert/strict";
import { buildLayout, childrenOf, cleanPath, revealDelays } from "../../components/explore/layout.ts";
import type { ExNode, ExploreData } from "../../lib/server/explore/explore.ts";

const n = (id: string, kind: ExNode["kind"], extra: Partial<ExNode> = {}): ExNode => ({ id, kind, label: id, sub: "", evidence: [], ...extra });
const data: ExploreData = {
  demo: false,
  college: {
    root: n("college-root", "root", { evidence: ["p1", "p2"] }),
    children: [n("m:1", "recommend", { evidence: ["p1"] }), n("m:2", "recommend")],
    next: { "m:1": [n("u:1", "target", { parentId: "m:1", evidence: ["p1"] })] },
    status: "ready", profileCount: 2,
  },
  career: { root: n("career-root", "root"), children: [], next: {}, status: "no-profiles", profileCount: 0 },
};
const projects = [{ id: "p1", title: "A" }, { id: "p2", title: "B" }];
const notes = [{ id: "g1", title: "노트", body: "", pos: null, project_ids: ["p1"], created_at: "", updated_at: "" }];
const base = { data, projects, notes, noteCount: () => 0, moved: {} };

test("시작 화면: 탐색 노드 없이 내 프로젝트 전부와 노트", () => {
  const { nodes } = buildLayout({ ...base, mode: null, path: [] });
  assert.deepEqual(nodes.map((x) => x.kind).sort(), ["note", "project", "project"]);
});

test("대학 진학: 루트 → 학과 → 대학 → 준비 정보, 근거 프로젝트만 아래에", () => {
  assert.deepEqual(childrenOf(data, "college", []).map((x) => x.id), ["m:1", "m:2"]);
  assert.deepEqual(childrenOf(data, "college", ["m:1"]).map((x) => x.id), ["u:1"]);
  assert.ok(childrenOf(data, "college", ["m:1", "u:1"]).every((x) => x.kind === "info"));
  const { nodes, links, focusId } = buildLayout({ ...base, mode: "college", path: ["m:1"] });
  assert.equal(focusId, "m:1");
  assert.deepEqual(nodes.filter((x) => x.kind === "project").map((x) => x.pid), ["p1"]);
  assert.ok(links.some((l) => l.kind === "child" && l.label === "개설 대학"));
  assert.ok(nodes.some((x) => x.kind === "note"));
});

test("점수표가 없는 직무: 루트만, 자식 없음", () => {
  const { nodes } = buildLayout({ ...base, mode: "career", path: [] });
  assert.deepEqual(nodes.map((x) => x.id), ["career-root"]);
});

test("저장된 경로 정리: 사라진 노드는 버리고 대학은 학과 아래로", () => {
  assert.deepEqual(cleanPath(data, "college", ["u:1"]), ["m:1", "u:1"]);
  assert.deepEqual(cleanPath(data, "college", ["gone"]), []);
});

test("생성 모션: 루트가 먼저, 일부만 펼칠 때는 새 노드만", () => {
  const { nodes } = buildLayout({ ...base, mode: "college", path: [] });
  const all = revealDelays(nodes);
  assert.equal(Math.min(...all.values()), all.get("college-root"));
  assert.deepEqual([...revealDelays(nodes, new Set(["m:2"])).keys()], ["m:2"]);
});
