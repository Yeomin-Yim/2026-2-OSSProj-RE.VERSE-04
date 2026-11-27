import { test } from "node:test";
import assert from "node:assert/strict";
import { newTokens, wordDiff } from "../../lib/core/index.ts";

test("wordDiff: 같은 단어는 eq, 빠진 단어는 del, 새 단어는 ins 로 묶는다", () => {
  const d = wordDiff("저는 정말 열심히 설문을 했다.", "저는 설문을 맡아 했다.");
  assert.equal(d.filter((p) => p.op !== "ins").map((p) => p.s).join(""), "저는 정말 열심히 설문을 했다.");
  assert.equal(d.filter((p) => p.op !== "del").map((p) => p.s).join(""), "저는 설문을 맡아 했다.");
  assert.deepEqual(d.find((p) => p.op === "del"), { op: "del", s: "정말 열심히 " });
  assert.deepEqual(wordDiff("같다", "같다"), [{ op: "eq", s: "같다" }]);
  assert.deepEqual(wordDiff("", "새 글"), [{ op: "ins", s: "새 글" }]);
});

test("newTokens: 원문에 없는 숫자·영문만 잡는다", () => {
  assert.deepEqual(newTokens("62명에게 설문을 했다.", "설문 62명을 진행했다."), []);
  assert.deepEqual(newTokens("설문을 했다.", "100명에게 설문을 해 30% 줄였다."), ["100", "30"]);
  assert.deepEqual(newTokens("Python 으로 분석", "python과 Excel로 분석"), ["Excel"]);
  assert.deepEqual(newTokens("1.5배", "1.5배 늘었다"), []);
});
