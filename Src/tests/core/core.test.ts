// 실행: cd Src && npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  checkProject, computeRelations, createTagger, groupByCode, hash, mergeTags,
  nextQuestions, scoreProfiles, splitText, toSentences, type RuleDict,
} from "../../lib/core/index.ts";

const dict: RuleDict = JSON.parse(
  readFileSync(new URL("../../../Doc/design/RE-Cord_규칙사전_v0.5.json", import.meta.url), "utf8"),
);
const tagger = createTagger(dict);
const codes = (t: string) => tagger.tagSentence(t).map((x) => x.code);

test("문장 나누기: 문장부호·줄바꿈에서 끊고 소수점에서는 끊지 않는다", () => {
  assert.deepEqual(splitText("계기였다. 내가 제안했다!\n- 다음 회의: 3.5일\n- v2.1 확인함."), [
    "계기였다.", "내가 제안했다!", "- 다음 회의: 3.5일", "- v2.1 확인함.",
  ]);
});

test("문장 ID와 해시", () => {
  const s = toSentences("첫 문장. 둘째 문장.", 11, 1);
  assert.equal(s[1].sid, "N11·V1·S2");
  assert.equal(s[0].hash, hash("첫  문장."));
});

test("태깅: 부분 일치와 맞은 구절", () => {
  const r = tagger.tagSentence("‘1인당 평균 잔반량’ 파생 변수를 내가 제안했다.");
  assert.ok(r.some((t) => t.code === "M06"));
  assert.ok(codes("설문 문항을 설계하고 카페 3곳 조사를 했다.").includes("M04"));
});

test("태깅: 함정 문장은 걸리지 않는다", () => {
  assert.ok(!codes("평균적으로 회의가 길었다.").includes("M06"));
  assert.ok(!codes("선생님이 지도해 주셨다.").includes("M10"));
  assert.ok(!codes("주간 보고서를 제출했다.").includes("O01"));
});

test("태깅: 제외 표현이 있으면 방법 태그는 버리고 주제 태그는 남긴다", () => {
  const c = codes("급식 설문은 시간이 없어 하지 않았다.");
  assert.ok(!c.includes("M04"));
  assert.ok(c.includes("D17"));
  assert.ok(codes("파생 변수를 내가 제안했다.").includes("M06")); // '제안했다'의 '안했'은 제외 표현이 아니다
});

test("태그 병합: student > ai > rule, 지운 태그는 빠진다", () => {
  const merged = mergeTags({
    rule: [{ code: "M06", sid: "N1·V1·S1", matched: "평균값" }, { code: "M04", sid: "N1·V1·S1", matched: "설문" }],
    ai: [{ code: "M07", sid: "N1·V1·S2", matched: "" }],
    student: [{ code: "M04", sid: "N1·V1·S1", matched: "", removed: true }],
  });
  assert.deepEqual(merged.map((t) => t.code).sort(), ["M06", "M07"]);
});

test("기록 확인 7항목과 보완 질문(최대 2개)", () => {
  const checks = checkProject({
    start_date: "2025-03-03", end_date: null,
    records: [{ kind: "meeting", is_result: false, has_file: false, url: null, answer_key: null,
      sentences: [{ text: "문제의 계기였다." }, { text: "인터뷰와 조사를 했다." }] }],
  });
  assert.deepEqual(checks, { period: false, role: false, problem: true, process: true, result: false, evidence: false, reflection: false });
  assert.deepEqual(nextQuestions(checks).map((q) => q.key), ["period", "role"]);
});

test("프로젝트 연결: 드문 태그가 겹칠수록 점수가 높다", () => {
  const P = (id: string, c: string[]) => ({ id, tags: groupByCode(c.map((code) => ({ code, sid: id, matched: "" }))) });
  const rel = computeRelations(
    [P("a", ["M12", "M04", "M06"]), P("b", ["M12", "M04", "M06"]), P("c", ["M12", "M17"]), P("d", ["M12", "O06"])],
    tagger.groupOf,
  );
  assert.equal(rel[0].a + rel[0].b, "ab");
  assert.equal(rel[0].score, 1);
  const ac = rel.find((r) => r.a === "a" && r.b === "c")!;
  assert.ok(ac.score < 0.3); // 모두가 가진 M12만 겹친다
});

test("학과·직무 점수: 발표 p24 예시 = 75점", () => {
  const P = (id: string, c: string[]) => ({ id, tags: groupByCode(c.map((code) => ({ code, sid: id, matched: "" }))) });
  const [r] = scoreProfiles(
    [P("P1", ["M06"]), P("P2", ["M09"]), P("P3", ["M06", "M04"]), P("P4", []), P("P5", ["M16"])],
    [{ id: "data", weights: { M06: 3, M16: 3, M04: 2, M09: 2 } }],
  );
  assert.deepEqual([r.breadth, r.depth, r.score, r.depth_project_id], [100, 50, 75, "P3"]);
  assert.ok(!r.cells.some((c) => c.hits.P4)); // 칸을 못 채운 P4는 근거에 없다
});
