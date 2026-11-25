import { test } from "node:test";
import assert from "node:assert/strict";
import { altRow, draftFromOverview, promptsFor, templateList, topTags, TEMPLATES, type PortfolioSource } from "../../lib/core/index.ts";

const src = (over: Partial<PortfolioSource> = {}): PortfolioSource => ({
  id: "p1", title: "우리 동네 다회용컵 순환 프로젝트", topic: "환경", start_date: "2024-03-04", end_date: "2024-06-28",
  overview: { problem: "일회용컵이 많이 버려졌다.", role: "설문 설계", process: "62명 설문을 했다.", result: "제안서를 완성했다.", reflection: "공감과 행동은 다르다." },
  records: [{ id: "r1", title: "회의록", text: "내가 설문을 맡았다." }], tags: ["설문 설계", "현장 조사"], ...over,
});

test("개요에서 가져오기: 글을 바꾸지 않고 그대로 옮긴다 (AI 아님)", () => {
  const d = draftFromOverview(src().overview);
  assert.equal(d.problem, "일회용컵이 많이 버려졌다.");
  assert.equal(d.role, "설문 설계\n\n62명 설문을 했다.");
  assert.equal(d.result, "제안서를 완성했다.\n\n공감과 행동은 다르다.");
  assert.deepEqual(draftFromOverview({}), { problem: "", role: "", result: "" });
});

test("대체서식 행: 이름·기간만 채우고 활동내용·기관·페이지는 비운다", () => {
  const r = altRow(src());
  assert.equal(r.name, "우리 동네 다회용컵 순환 프로젝트");
  assert.equal(r.period, "2024.03.04 ~ 2024.06.28");
  assert.equal(r.content, "");
  assert.equal(r.org, "");
});

test("스킬: 선택한 프로젝트에서 많이 나온 태그 순", () => {
  const tags = topTags([src(), src({ id: "p2", tags: ["현장 조사", "Python"] })]);
  assert.equal(tags[0], "현장 조사");
  assert.ok(tags.includes("Python"));
});

test("서식 목록에 프로필 서식은 숨기고, 프롬프트에 입력 자료가 들어간다", () => {
  assert.deepEqual(templateList().map((t) => t.id), ["portfolio-project", "altform-dongguk-2027"]);
  const p = promptsFor("portfolio-project", [src()]);
  assert.deepEqual(Object.keys(p), TEMPLATES["portfolio-project"].sections.map((s) => s.key));
  assert.match(p.problem, /overview\.problem: 일회용컵/);
});
