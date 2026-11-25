import type { Sentence } from "../types.ts";

// 기록 확인 7항목 (발표 p16). 저장하지 않고 필요할 때마다 계산한다.
export type CheckKey = "period" | "role" | "problem" | "process" | "result" | "evidence" | "reflection";

const KW: Record<"role" | "problem" | "process" | "result" | "reflection", RegExp> = {
  role: /내가|제가|맡|담당|역할/u,
  problem: /문제|불편|어려|왜|계기/u,
  process: /인터뷰|조사|관찰|시도|수정|제작/gu, // 서로 다른 표현 2개 이상
  result: /완성|결과|시안|발표/u,
  reflection: /배운|배웠|느낀|다음엔|다음에는|아쉬|개선/u,
};

// 빈 항목에 보여 줄 질문. 문구는 프로토타입과 같다.
//   action: edit = 기간 입력 / answer = 바로 적기 / upload = 자료 추가
export const QUESTIONS: Record<CheckKey, { question: string; hint: string; action: "edit" | "answer" | "upload"; cta: string }> = {
  period: { question: "언제부터 언제까지?", hint: "프로젝트 기간을 입력해요.", action: "edit", cta: "기간 입력하기" },
  role: { question: "직접 맡은 부분은?", hint: "내가 한 일을 한두 문장으로 남겨요.", action: "answer", cta: "짧게 답하기" },
  problem: { question: "왜 시작했나요?", hint: "시작한 계기나 불편을 남겨요.", action: "answer", cta: "짧게 답하기" },
  process: { question: "어떻게 해결했나요?", hint: "시도하고 수정한 과정을 남겨요.", action: "answer", cta: "짧게 답하기" },
  result: { question: "완성한 결과물이 있나요?", hint: "시안이나 발표자료를 추가해요.", action: "upload", cta: "자료 추가하기" },
  evidence: { question: "당시 자료가 있나요?", hint: "사진·문서·링크를 추가해요.", action: "upload", cta: "자료 추가하기" },
  reflection: { question: "무엇을 배웠나요?", hint: "배운 점과 다음 개선점을 남겨요.", action: "answer", cta: "짧게 답하기" },
};

export const CHECK_LABEL: Record<CheckKey, string> = {
  period: "기간", role: "역할", problem: "문제", process: "과정", result: "결과", evidence: "증빙", reflection: "회고",
};

export const CHECK_ORDER: CheckKey[] = ["period", "role", "problem", "process", "result", "evidence", "reflection"];

export interface CheckInput {
  start_date: string | null;
  end_date: string | null;
  records: {
    kind: string;
    is_result: boolean;
    has_file: boolean;
    url: string | null;
    answer_key: string | null;
    sentences: Pick<Sentence, "text">[];
  }[];
}

/** 7항목이 채워졌는지 계산한다. */
export function checkProject(p: CheckInput): Record<CheckKey, boolean> {
  const texts = p.records.flatMap((r) => r.sentences.map((s) => s.text));
  const answered = new Set(p.records.map((r) => r.answer_key).filter(Boolean));
  const has = (k: "role" | "problem" | "result" | "reflection") => answered.has(k) || texts.some((t) => KW[k].test(t));
  const processWords = new Set(texts.flatMap((t) => t.match(KW.process) ?? []));
  return {
    period: !!(p.start_date && p.end_date),
    role: has("role"),
    problem: has("problem"),
    process: answered.has("process") || processWords.size >= 2,
    result: has("result") || p.records.some((r) => r.is_result),
    evidence: p.records.some((r) => r.has_file || !!r.url || r.kind === "photo"),
    reflection: has("reflection"),
  };
}

/** 빈 항목만, 한 번에 최대 2개 묻는다. */
export function nextQuestions(checks: Record<CheckKey, boolean>, max = 2) {
  return CHECK_ORDER.filter((k) => !checks[k])
    .slice(0, max)
    .map((key) => ({ key, ...QUESTIONS[key] }));
}
