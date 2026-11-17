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
