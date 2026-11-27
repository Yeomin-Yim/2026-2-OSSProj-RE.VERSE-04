import { test } from "node:test";
import assert from "node:assert/strict";
import { checkAssignment, noteText, parseSessions, resolveAssignment, sourceKeys, subjectName, type GcamUnit } from "../../lib/core/gcam-import/gcam.ts";

let n = 0;
const u = (type: GcamUnit["type"], text: string): GcamUnit => ({ id: `U${++n}`, page: 1, type, text, uncertain: false });

const units = [
  u("heading", "거캐머의 하루"), // U1 표지
  u("date", "2026년 8월 27일 목요일"), // U2
  u("heading", "국어"), // U3 과목 배지
  u("heading", "오전 교육과정 (국어)"), // U4
  u("heading", "배운 점"), // U5
  u("body", "자원 분쟁에 대해 생각했다."), // U6
  u("body", "오후 교육과정"), // U7 (OCR 이 body 로 줄 때도 있다)
  u("heading", "배운 점"), // U8
  u("body", "개주프 계획을 세웠다."), // U9
  u("body", "TO. 코치"), // U10
  u("body", "발표 언제예요?"), // U11
  u("body", "마지막 수정: 2026. 08. 27. 16:01 (KST)"), // U12
  u("date", "2026년 8월 28일 금요일"), // U13
  u("heading", "오전 교육과정 (영어(선윤반))"), // U14
  u("heading", "배운 점"), // U15 소제목만 있는 빈 칸
  u("heading", "오후 교육과정"), // U16
  u("body", "부스 아이디어이션"), // U17
];

test("거캠: 칸 나누기 — 과목·날짜, 빈 칸과 머리글은 제외, 모든 단위는 한 곳에만", () => {
  const { sessions, dropped } = parseSessions(units);
  assert.deepEqual(
    sessions.map((s) => [s.date, s.part, s.subject, s.units.map((x) => x.id)]),
    [
      ["2026-08-27", "am", "국어", ["U5", "U6"]],
      ["2026-08-27", "pm", null, ["U8", "U9", "U10", "U11"]],
      ["2026-08-28", "pm", null, ["U17"]],
    ],
  );
  assert.deepEqual(checkAssignment(units.map((x) => x.id), [dropped, ...sessions.map((s) => s.units.map((x) => x.id))]), []);
});

test("거캠: 과목 이름에서 반 이름을 빼고, '기타'는 과목으로 보지 않는다", () => {
  assert.equal(subjectName("영어(선유반)"), "영어");
  assert.equal(subjectName("수학(꽃게탕)"), "수학");
  assert.equal(subjectName("국어A반"), "국어");
  assert.equal(subjectName("과학4반"), "과학");
  assert.equal(subjectName("사회문화"), "사회문화"); // 뒤에 한글이 이어지면 다른 과목 이름이다
  assert.equal(subjectName("기술가정"), "기술가정");
  assert.equal(subjectName("기타"), null);
});

test("거캠: 노트 본문은 원래 순서, 배정 검사는 빠짐·중복·없는 ID를 잡는다", () => {
  assert.equal(noteText(units, ["U9", "U8"]), "배운 점\n개주프 계획을 세웠다.");
  assert.deepEqual(checkAssignment(["U1", "U2", "U3"], [["U1", "U1"], ["U9"]]), ["중복 U1", "없는 단위 U9", "빠짐 U2", "빠짐 U3"]);
});

test("거캠: AI 묶음 바로잡기 — 직접 적은 U번호 우선, 중복·없는 ID 제거, 빠진 단위는 missing", () => {
  const { sessions } = parseSessions(units); // S1=[U5,U6] S2=[U8,U9,U10,U11] S4=[U17] (S3 은 빈 칸이라 빠짐)
  // S2 를 통째로 넣으면서 같은 칸의 U10·U11 을 다른 노트에 직접 적은 경우 + U10 을 한 번 더 적은 경우
  const r = resolveAssignment(sessions, [["S2"], ["U10", "U11", "U99"], ["U10"], ["S1"]]);
  assert.deepEqual(r.groups, [["U8", "U9"], ["U10", "U11"], [], ["U5", "U6"]]);
  assert.deepEqual(r.missing.map((m) => [m.session.id, m.ids]), [["S4", ["U17"]]]);
  assert.deepEqual(r.fixes, ["없는 단위 U99", "중복 U10", "빠짐 U17"]);
});

test("거캠: 칸의 일부만 빠지면 같은 칸의 앞 단위 묶음에 붙고, 앞이 없으면 뒤 단위 쪽으로", () => {
  const { sessions } = parseSessions(units); // S2=[U8 소제목, U9, U10 TO.코치, U11]
  // AI 가 S2 를 둘로 나누면서 소제목 U8 과 U10 을 빠뜨린 경우
  const r = resolveAssignment(sessions, [["U9"], ["U11"], ["S1"], ["S4"]]);
  // U8 은 앞이 없어 뒤(U9) 쪽, U10 은 앞(U9) 쪽으로 붙는다
  assert.deepEqual(r.groups, [["U8", "U9", "U10"], ["U11"], ["U5", "U6"], ["U17"]]);
  assert.deepEqual(r.missing, []);
  assert.deepEqual(r.fixes, ["붙임 U8→U9", "붙임 U10→U9"]);
});

test("거캠: 칸 키 — 날짜·오전/오후·칸 안 순번, 노트 순서와 무관", () => {
  const { sessions } = parseSessions(units);
  assert.deepEqual(sourceKeys(sessions, [["U17"], ["U10", "U11"], ["U5", "U6"], ["U8", "U9"], ["U99"]]), [
    "gcam:2026-08-28:pm:0",
    "gcam:2026-08-27:pm:1",
    "gcam:2026-08-27:am:0",
    "gcam:2026-08-27:pm:0",
    null,
  ]);
});

test("확인 노트 추천 순서: 팀 말이면 팀 프로젝트, 개주프 말이면 개인주제 프로젝트 (실제 사례)", async () => {
  const { overlap } = await import("../../lib/server/gcam-import/draft.ts");
  const team = "초보자 비건 정보 플랫폼 프로젝트", mine = "베이킹 레시피 e북 개주프";
  const rank = (text: string) => [team, mine].sort((a, b) => overlap(b, text) - overlap(a, text))[0];
  assert.equal(rank("이그나이트 5분발표, 1학기를 돌아보며 팀 대화를 했다"), team);
  assert.equal(rank("1차로 했던 현장관찰을 정리하고 AEIOU를 정리했다."), team);
  assert.equal(rank("개주프를 진행했다 영상 6번째 만들었다"), mine);
});
