import { createHash } from "node:crypto";

/** 비교용 정리: NFC → 영문 소문자 → 공백 하나로 */
export function normalize(s: string): string {
  return s.normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();
}

/** 글의 지문. 본문이 같은지, 문장이 같은지 비교하는 데 쓴다. */
export function hash(s: string): string {
  return createHash("sha256").update(normalize(s)).digest("hex").slice(0, 16);
}
