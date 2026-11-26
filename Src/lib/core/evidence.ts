// AI 가 쓴 글의 근거 검증 (개요 6항목 · 포트폴리오 초안 공통).
// AI 에게는 "[문장ID] 문장" 형식으로 기록을 보내고, 글마다 근거 문장 ID 를 적게 한다.
// 코드는 그 ID 가 실제로 보낸 문장인지 확인하고, 없는 ID 는 버린다.
// 근거가 하나도 남지 않은 글은 "기록에 없는 내용"으로 보고 비운다.

import type { Sentence } from "./types.ts";

export interface Cited {
  text: string;
  sids: string[];
}

export interface EvidenceRecord {
  title: string;
  recorded_at: string;
  sentences: Sentence[];
}

/**
 * 기록들을 AI 입력 글로 바꾼다. 오래된 기록부터 시간 순.
 * shortcut: 글자 수가 maxChars 를 넘으면 최근 기록만 보낸다. 기록이 아주 많은 프로젝트가 생기면 요약 단계를 추가.
 */
export function evidenceText(records: EvidenceRecord[], maxChars = 40000): { text: string; known: Set<string> } {
  const newestFirst = [...records].sort((a, b) => b.recorded_at.localeCompare(a.recorded_at));
  const blocks: string[] = [];
  const known = new Set<string>();
  let size = 0;
  for (const r of newestFirst) {
    if (!r.sentences.length) continue;
    const block = [`## ${r.title} (${r.recorded_at})`, ...r.sentences.map((s) => `[${s.sid}] ${s.text}`)].join("\n");
    if (size + block.length > maxChars && blocks.length) break;
    blocks.push(block);
    size += block.length;
    for (const s of r.sentences) known.add(s.sid);
  }
  return { text: blocks.reverse().join("\n\n"), known };
}

/** 없는 근거 ID 는 버리고, 근거가 없는 글은 비운다. problems 는 바로잡은 내역 (품질 확인용) */
export function keepCited<K extends string>(fields: Record<K, Cited>, known: Set<string>, maxLength = 1000) {
  const problems: string[] = [];
  const out = {} as Record<K, Cited>;
  for (const key of Object.keys(fields) as K[]) {
    const { text, sids } = fields[key];
    const valid = [...new Set(sids)].filter((sid) => known.has(sid));
    const bad = sids.filter((sid) => !known.has(sid));
    if (bad.length) problems.push(`${key}: 없는 근거 ${bad.join(", ")}`);
    if (text.trim() && !valid.length) {
      problems.push(`${key}: 근거가 없어 비움`);
      out[key] = { text: "", sids: [] };
    } else {
      out[key] = { text: text.trim().slice(0, maxLength), sids: valid };
    }
  }
  return { fields: out, problems };
}
