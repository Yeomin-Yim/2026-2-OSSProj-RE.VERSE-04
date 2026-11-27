import { test } from "node:test";
import assert from "node:assert/strict";
import { jobNcs, pickForJob, toPublicPosting, type AlioRow } from "../../lib/core/index.ts";

const row = (o: Partial<AlioRow>): AlioRow => ({
  recrutPblntSn: 1, instNm: "기관", recrutPbancTtl: "채용 공고", pbancBgngYmd: "20261120", pbancEndYmd: "20261210",
  ncsCdLst: "R600006", recrutSe: "R2010", acbgCondLst: "R7010", ongoingYn: "Y", ...o,
});
const today = new Date("2026-11-28");

test("공공기관 공고: 직무 이름 → NCS 분야", () => {
  assert.deepEqual(jobNcs("간호사")?.ncs, ["R600006"]);
  assert.deepEqual(jobNcs("웹접근성컨설턴트")?.words.includes("접근성"), true);
  assert.equal(jobNcs("우주비행사"), null);
});

test("공공기관 공고: 제목에 직무 말이 있는 진행 중 공고만, 최신순", () => {
  const rows = [
    row({ recrutPblntSn: 1, recrutPbancTtl: "신규직원(간호사) 채용", pbancBgngYmd: "20261120" }),
    row({ recrutPblntSn: 2, recrutPbancTtl: "간호사 채용", pbancBgngYmd: "20261127" }),
    row({ recrutPblntSn: 3, recrutPbancTtl: "의사 채용" }), // 직무 말 없음
    row({ recrutPblntSn: 4, recrutPbancTtl: "간호사 경력 채용", recrutSe: "R2020" }), // 경력 전용
    row({ recrutPblntSn: 5, recrutPbancTtl: "간호사 채용", pbancEndYmd: "20261127" }), // 마감
    row({ recrutPblntSn: 6, recrutPbancTtl: "간호사 인턴", pbancBgngYmd: "20270201" }), // 접수 전
    row({ recrutPblntSn: 7, recrutPbancTtl: "간호사 채용", acbgCondLst: "R7060,R7070" }), // 석박사 전용
    row({ recrutPblntSn: 8, recrutPbancTtl: "간호사 채용", ncsCdLst: "R600020" }), // 다른 분야
  ];
  const r = pickForJob(rows, "간호사", 6, today);
  assert.deepEqual(r.items.map((p) => p.id), ["2", "1"]);
});

test("공공기관 공고: 기관 이름·미화원 공고는 직무로 세지 않는다", () => {
  const rows = [
    row({ ncsCdLst: "R600020", instNm: "한국체육산업개발(주)", recrutPbancTtl: "한국체육산업개발(주) 전임직 채용공고" }),
    row({ recrutPblntSn: 2, ncsCdLst: "R600023", recrutPbancTtl: "기간제 근로자(환경미화원) 채용" }),
  ];
  assert.equal(pickForJob(rows, "모바일앱개발자", 6, today).items.length, 0);
  assert.equal(pickForJob(rows, "환경컨설턴트", 6, today).items.length, 0);
});

test("공공기관 공고: 배지·전형·체크리스트", () => {
  const p = toPublicPosting(row({
    acbgCondLst: "R7030,R7050",
    scrnprcdrMthdExpln: "□ 서류전형\n□ 필기전형(NCS 직업기초능력)\n□ 면접전형",
    aplyQlfcCn: "- 간호사 면허 소지자\n- 학력 제한 없음",
    prefCn: "취업지원대상자, 장애인",
    pbancEndYmd: "20261214",
  }), ["간호"]);
  assert.deepEqual(p.badges, ["고졸 가능", "신입"]);
  assert.equal(p.openToHighSchool, true);
  assert.deepEqual(p.stages, ["서류전형", "필기시험", "면접"]);
  assert.deepEqual(p.preferred, ["보훈·취업지원대상자", "장애인"]);
  assert.ok(p.checklist.includes("필요 자격증·면허 확인"));
  assert.equal(p.checklist.at(-1), "지원서 제출 (마감 12/14)");
});

test("공공기관 공고: AI 2글자 말은 낱말 첫머리에서만, 흔한 말은 세지 않는다 (D36)", async () => {
  const { titleHas, pickForJob } = await import("../../lib/core/index.ts");
  assert.equal(titleHas("단기전임직 채용", "기전", true), false);
  assert.equal(titleHas("건설기계인증처 기간제", "인증", true), false);
  assert.equal(titleHas("기간제(일용직_우편물)", "우편", true), true);
  assert.equal(titleHas("보험심사간호사", "간호"), true); // 손 규칙 말은 그대로
  const rows = Array.from({ length: 20 }, (_, i) => row({ recrutPblntSn: i + 1, ncsCdLst: "R600015", recrutPbancTtl: `제설 정비원 채용 ${i}` }));
  rows.push(row({ recrutPblntSn: 99, ncsCdLst: "R600015", recrutPbancTtl: "선박정비 기술직 채용" }));
  const r = pickForJob(rows, "선박정비원", 5, today, { ncs: ["R600015"], words: ["선박정비", "정비"] });
  assert.deepEqual(r.items.map((p) => p.id), ["99"]); // "정비"는 20건 넘게 나와 세지 않음
});
