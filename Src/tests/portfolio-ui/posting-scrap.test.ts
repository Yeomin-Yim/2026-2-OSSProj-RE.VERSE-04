// 채용공고 스크랩 (components/scraps/posting.ts, D016) — 실행: cd Src && npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { isClosed, isPostingScrap, postingScrapInput, POSTING_PREFIX } from "../../components/scraps/posting.ts";

const node = {
  id: "post-1", kind: "posting", label: "공고", parentId: "job-a", url: "https://example.com/p/1",
  posting: { company: "한국OO공사", title: "고졸 채용형 인턴", location: "서울", deadline: "2026-12-10", requirements: [], preferred: [], summary: "", source: "public" },
} as unknown as Parameters<typeof postingScrapInput>[0];

test("공고 노드 → DB가 허용하는 job 타입 + posting: 접두어로 저장 입력을 만든다", () => {
  const input = postingScrapInput(node, "사무원")!;
  assert.equal(input.type, "job");
  assert.equal(input.ref_id, POSTING_PREFIX + "post-1");
  assert.equal(input.title, "고졸 채용형 인턴");
  const meta = input.meta as unknown as Record<string, unknown>;
  assert.equal(meta.kind, "posting");
  assert.equal(meta.url, "https://example.com/p/1");
  assert.equal(meta.jobId, "job-a");
  assert.deepEqual(input.loc, { mode: "career", path: ["job-a"], sel: "post-1" });
});

test("직무 스크랩과 공고 스크랩을 구분한다", () => {
  assert.equal(isPostingScrap({ type: "job", ref_id: "posting:post-1" }), true);
  assert.equal(isPostingScrap({ type: "job", ref_id: "job-a" }), false);
  assert.equal(isPostingScrap({ type: "major", ref_id: "posting:x" }), false);
});

test("마감일 판정: 지난 날짜만 마감, 날짜가 아니면 마감 아님", () => {
  const today = new Date(2026, 10, 28);
  assert.equal(isClosed("2026-11-27", today), true);
  assert.equal(isClosed("2026-11-28", today), false);
  assert.equal(isClosed("2026.12.01", today), false);
  assert.equal(isClosed("상시채용", today), false);
});
