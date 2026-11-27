// 문장 다듬기 (wireframe 3-3, 프로토타입 refineSync·wordDiff). AI 가 고친 글을 학생에게 보여 주기 전에 쓰는 순수 계산.

export type RefineMode = "concise" | "role" | "rewrite";
export const REFINE_LABEL: Record<RefineMode, string> = { concise: "더 간결하게", role: "내 역할 중심으로", rewrite: "다시 쓰기" };

export type DiffPart = { op: "eq" | "del" | "ins"; s: string };

/** 단어(공백 포함) 단위 LCS diff. 연속된 삭제·추가는 한 덩어리로 묶는다 (프로토타입 wordDiff 와 같은 방식) */
export function wordDiff(a: string, b: string): DiffPart[] {
  const A = a.split(/(\s+)/).filter(Boolean), B = b.split(/(\s+)/).filter(Boolean);
  const n = A.length, m = B.length;
  const dp = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: DiffPart[] = [];
  const push = (op: DiffPart["op"], s: string) => {
    const last = out[out.length - 1];
    if (last && last.op === op) last.s += s; else out.push({ op, s });
  };
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { push("eq", A[i]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) push("del", A[i++]);
    else push("ins", B[j++]);
  }
  while (i < n) push("del", A[i++]);
  while (j < m) push("ins", B[j++]);
  return out;
}

/** 고친 글에 새로 생긴 숫자·영문 토큰 (원문에 없으면 기록에 없는 수치·이름일 수 있다). 비어 있으면 통과 */
export function newTokens(original: string, refined: string): string[] {
  const grab = (t: string) => t.match(/\d+(?:[.,]\d+)*|[A-Za-z][A-Za-z0-9]*/g) ?? [];
  const have = new Set(grab(original).map((x) => x.toLowerCase()));
  return [...new Set(grab(refined).filter((x) => !have.has(x.toLowerCase())))];
}
