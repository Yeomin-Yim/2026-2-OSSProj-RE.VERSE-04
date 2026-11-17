import { normalize } from "./text.ts";
import type { RuleDict, Sentence, Tag, TagGroup } from "./types.ts";

export interface Tagger {
  version: string;
  groupOf(code: string): TagGroup | undefined;
  tagSentence(text: string): { code: string; matched: string }[];
  tagSentences(sentences: Sentence[]): Tag[];
}

/** 규칙 사전을 정규식으로 한 번 컴파일해 둔다. */
export function createTagger(dict: RuleDict): Tagger {
  const rules = Object.entries(dict.tags).map(([code, t]) => ({
    code,
    group: t.group,
    re: new RegExp(t.patterns.join("|"), "iu"),
  }));
  const exclude = dict.exclude_default.length ? new RegExp(dict.exclude_default.join("|"), "iu") : null;
  const excluded = new Set(dict.exclude_applies_to);

  function tagSentence(text: string) {
    const s = normalize(text);
    const skip = exclude ? exclude.test(s) : false; // '못 했', '할 예정' 등
    const out: { code: string; matched: string }[] = [];
    for (const r of rules) {
      if (skip && excluded.has(r.group)) continue;
      const m = r.re.exec(s);
      if (m) out.push({ code: r.code, matched: m[0] });
    }
    return out;
  }

  return {
    version: dict.version,
    groupOf: (code) => dict.tags[code]?.group,
    tagSentence,
    tagSentences: (sentences) =>
      sentences.flatMap((s) => tagSentence(s.text).map((t) => ({ ...t, sid: s.sid }))),
  };
}

/**
 * 출처별 태그를 합친다. 같은 문장·같은 태그는 student > ai > rule.
 * 학생이 지운 태그(removed)는 규칙이 다시 붙여도 빠진다.
 */
export function mergeTags(bySource: { rule?: Tag[]; ai?: Tag[]; student?: Tag[] }): Tag[] {
  const merged = new Map<string, Tag>();
  for (const src of ["rule", "ai", "student"] as const) {
    for (const t of bySource[src] ?? []) merged.set(`${t.code}|${t.sid}`, t);
  }
  return [...merged.values()].filter((t) => !t.removed);
}

/** 태그 목록 → 태그 코드별 근거 문장 */
export function groupByCode(tags: Tag[]): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const t of tags) {
    const list = m.get(t.code) ?? [];
    if (!list.includes(t.sid)) list.push(t.sid);
    m.set(t.code, list);
  }
  return m;
}
