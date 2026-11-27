import { test } from "node:test";
import assert from "node:assert/strict";
import { postingKeyword, postingNodes, searchPostings, toPosting } from "../../lib/server/explore/postings.ts";

test("채용공고 검색어: 괄호·'및 …'을 떼고, 공고에 잘 쓰이는 말로 바꾼다", () => {
  assert.equal(postingKeyword("사회복지사"), "사회복지사");
  assert.equal(postingKeyword("학예사(큐레이터)"), "학예사");
  assert.equal(postingKeyword("통신공학 기술자 및 연구원"), "통신공학 기술자");
  assert.equal(postingKeyword("빅 데이터 전문가"), "빅데이터 분석");
});

test("사람인 응답 → 공고: 링크·제목이 없으면 버리고, 마감일·지역을 사람이 읽는 모양으로", () => {
  const p = toPosting({
    id: 123, url: "https://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx=123", active: 1,
    company: { detail: { name: "(주)예시" } },
    position: { title: "데이터 분석 &gt; 주니어", location: { name: "서울 &gt; 강남구,서울 &gt; 서초구" }, "experience-level": { name: "신입" }, "required-education-level": { name: "대학졸업(4년)이상" }, "job-type": { name: "정규직" } },
    keyword: "데이터분석,Python", "expiration-timestamp": 1798732799, "close-type": { name: "접수마감일" },
  })!;
  assert.equal(p.title, "데이터 분석 > 주니어");
  assert.equal(p.location, "서울 > 강남구");
  assert.match(p.deadline, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual([p.experience, p.education], ["신입", "대학졸업(4년)이상"]);
  assert.equal(toPosting({ id: 1, position: { title: "링크 없음" } }), null);
  assert.equal(toPosting({ id: 2, url: "javascript:alert(1)", position: { title: "x" } }), null);
  assert.equal(toPosting({ id: 3, url: "https://x", position: { title: "상시" }, "close-type": { name: "상시" } })!.deadline, "상시");

  const nodes = postingNodes({ id: "j:1", kind: "recommend", label: "데이터 분석가", sub: "", evidence: [] }, [p]);
  assert.equal(nodes[0].kind, "posting");
  assert.equal(nodes[0].parentId, "j:1");
  assert.equal(nodes[0].url, p.url);
});

test("키가 없으면 부르지 않고 빈 목록", async () => {
  assert.deepEqual(await searchPostings("사회복지사", ""), []);
});
