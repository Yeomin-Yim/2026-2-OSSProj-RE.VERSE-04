// 프로젝트 화면에서 쓰는 표시 형식 (프로토타입과 같은 모양)
import type { IconName } from "@/components/ui/Icon";

/** "2025-03-01" → "2025.03" */
export const ym = (date: string | null) => (date ? date.slice(0, 7).replace("-", ".") : "");

/** "2025-03-28" → "2025.03.28" */
export const ymd = (date: string | null) => (date ? date.slice(0, 10).replaceAll("-", ".") : "");

/** 월 입력값("2025-03") → 그 달의 첫날 또는 마지막 날 */
export function monthToDate(month: string, end: boolean): string | null {
  if (!month) return null;
  if (!end) return month + "-01";
  const last = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
  return `${month}-${String(last).padStart(2, "0")}`;
}

export const STATUS_LABEL = { active: "진행 중", done: "완료" } as const;

const KIND_LABEL: Record<string, string> = {
  photo: "사진", link: "링크", memo: "메모",
  meeting: "회의록", reflection: "회고", document: "문서", slides: "발표", result: "결과물",
};
export const kindLabel = (kind: string) => KIND_LABEL[kind] ?? "파일";

export const kindIcon = (kind: string): IconName =>
  kind === "photo" ? "image" : kind === "link" ? "link" : kind === "memo" ? "pen" : "file";

/**
 * 자료 목록의 본문 미리보기 (D007). 서버 요약이 없어 원문 앞부분을 그대로 잘라 보여 준다 — "요약"이라 부르지 않는다.
 * 본문이 없는 자료(사진·스캔 PDF·링크)는 유형에 맞는 설명을 돌려준다.
 */
export function excerpt(r: { raw_text: string; kind: string; has_file: boolean; url: string | null }, max = 90): { text: string; empty: boolean } {
  const t = (r.raw_text ?? "").replace(/\s+/g, " ").trim();
  if (t) return { text: t.length > max ? t.slice(0, max).trimEnd() + "…" : t, empty: false };
  if (r.kind === "photo") return { text: "사진 자료 · 눌러서 사진을 볼 수 있어요", empty: true };
  if (r.url) {
    let host = r.url;
    try { host = new URL(r.url).host; } catch { /* 주소 형식이 아니면 그대로 */ }
    return { text: `링크 · ${host}`, empty: true };
  }
  if (r.has_file) return { text: "파일에서 글자를 찾지 못했어요 · 원본 파일은 열어 볼 수 있어요", empty: true };
  return { text: "본문이 없는 자료예요", empty: true };
}
