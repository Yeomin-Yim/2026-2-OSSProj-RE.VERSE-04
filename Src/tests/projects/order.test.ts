import { test } from "node:test";
import assert from "node:assert/strict";
import { orderProjects } from "../../lib/core/index.ts";

test("프로젝트 목록: 팀·개인주제는 최근 순으로 위, 과목·일반 활동은 아래 묶음", () => {
  const p = (title: string, end: string | null) => ({ title, start_date: null, end_date: end });
  const { main, other } = orderProjects([p("국어", "2026-11-20"), p("비건 정보 팀 프로젝트", "2026-11-25"), p("일반 활동", null), p("베이킹 e북 개주프", "2026-12-01"), p("옛 프로젝트", null)]);
  assert.deepEqual(main.map((x) => x.title), ["베이킹 e북 개주프", "비건 정보 팀 프로젝트", "옛 프로젝트"]);
  assert.deepEqual(other.map((x) => x.title), ["국어", "일반 활동"]);
});
