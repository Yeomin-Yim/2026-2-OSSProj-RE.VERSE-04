import { hash } from "./text.ts";
import type { Sentence } from "./types.ts";

const segmenter = new Intl.Segmenter("ko", { granularity: "sentence" });
const MIN_LEN = 2; // 이보다 짧은 조각("-", "1." 등)은 앞 문장에 붙인다

/** 글을 문장으로 나눈다. 줄바꿈과 문장부호에서 끊는다. */
export function splitText(text: string): string[] {
  const out: string[] = [];
  for (const line of text.normalize("NFC").split(/\r?\n/)) {
    for (const { segment } of segmenter.segment(line)) {
      const s = segment.trim();
      if (!s) continue;
      if (s.length < MIN_LEN && out.length) out[out.length - 1] += " " + s;
      else out.push(s);
    }
  }
  return out;
}

export function sid(recordNo: number, version: number, n: number): string {
  return `N${recordNo}·V${version}·S${n}`;
}

/** record_versions.sentences 에 넣을 문장 목록을 만든다. */
export function toSentences(
  text: string,
  recordNo: number,
  version: number,
  extra: { page?: number; entry_date?: string } = {},
): Sentence[] {
  return splitText(text).map((t, i) => ({
    sid: sid(recordNo, version, i + 1),
    n: i + 1,
    text: t,
    hash: hash(t),
    ...extra,
  }));
}
