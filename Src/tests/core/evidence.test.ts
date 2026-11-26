import { test } from "node:test";
import assert from "node:assert/strict";
import { evidenceText, keepCited, type EvidenceRecord } from "../../lib/core/index.ts";

const rec = (title: string, date: string, ...lines: [string, string][]): EvidenceRecord => ({
  title, recorded_at: date, sentences: lines.map(([sid, text], i) => ({ sid, n: i + 1, text, hash: "" })),
});

test("근거 입력: 오래된 기록부터, 넘치면 최근 기록만 보낸다", () => {
  const old = rec("첫 회의", "2026-03-01", ["N1·V1·S1", "주제를 정했다."]);
  const mid = rec("설문", "2026-03-10", ["N2·V1·S1", "62명에게 설문했다."]);
  const empty = rec("사진", "2026-03-11");
  const { text, known } = evidenceText([mid, empty, old]);
  assert.ok(text.indexOf("첫 회의") < text.indexOf("설문"));
  assert.ok(text.includes("[N2·V1·S1] 62명에게 설문했다."));
  assert.deepEqual([...known].sort(), ["N1·V1·S1", "N2·V1·S1"]);

  const cut = evidenceText([old, mid], 40);
  assert.deepEqual([...cut.known], ["N2·V1·S1"]);
});

test("근거 검증: 없는 ID 는 버리고, 근거가 없는 글은 비운다", () => {
  const known = new Set(["N1·V1·S1", "N2·V1·S1"]);
  const { fields, problems } = keepCited({
    role: { text: " 설문을 맡았다. ", sids: ["N2·V1·S1", "N9·V1·S1", "N2·V1·S1"] },
    result: { text: "상을 받았다.", sids: ["N9·V9·S9"] },
    reflection: { text: "", sids: [] },
  }, known);
  assert.deepEqual(fields.role, { text: "설문을 맡았다.", sids: ["N2·V1·S1"] });
  assert.deepEqual(fields.result, { text: "", sids: [] });
  assert.deepEqual(fields.reflection, { text: "", sids: [] });
  assert.equal(problems.length, 3);
});
