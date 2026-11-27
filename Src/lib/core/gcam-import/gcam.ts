// 거캠('거캐머의 하루') 회고록 OCR 결과를 기록 칸(세션)으로 나누는 순수 함수.
// 회고록 구조: 1쪽 표지, 이후 1쪽 = 하루. 하루는 '오전 교육과정 (과목)'과 '오후 교육과정' 칸으로 나뉜다.
// 규칙(사용자 결정): 오전 = 과목별 프로젝트에 코드가 배정 / 오후 = AI가 묶음 / 'TO. 코치'는 본문에 넣고 '마지막 수정'은 뺀다.

export interface GcamUnit {
  id: string; // U0001… (코드가 붙인 번호)
  page: number;
  type: "date" | "heading" | "body";
  text: string;
  uncertain: boolean;
}

export interface Session {
  id: string; // S1…
  date: string | null; // YYYY-MM-DD
  part: "am" | "pm";
  /** 오전 칸의 과목. 이 값이 있으면 코드가 과목 프로젝트에 넣고, 없으면(오후·'기타'·과목 없음) AI가 묶는다. */
  subject: string | null;
  units: GcamUnit[];
}

const SESSION = /^(오전|오후)\s*교육과정\s*(?:\((.+)\))?\s*$/;
const LAST_EDIT = /^마지막\s*수정/;

/**
 * 돌려주는 값
 *   sessions: 내용(body)이 있는 칸만
 *   dropped:  노트에 넣지 않는 단위 (표지, 날짜 머리글, 과목 배지, 칸 머리글, '마지막 수정', 빈 칸)
 * 모든 단위는 둘 중 정확히 한 곳에 들어간다.
 */
export function parseSessions(units: GcamUnit[]): { sessions: Session[]; dropped: string[] } {
  const sessions: Session[] = [];
  const dropped: string[] = [];
  let date: string | null = null;
  let current: Session | null = null;

  for (const u of units) {
    const head = u.text.trim().match(SESSION);
    if (u.type === "date") {
      date = toIsoDate(u.text);
      current = null;
      dropped.push(u.id);
    } else if (head) {
      const subject = head[1] === "오전" && head[2] ? subjectName(head[2]) : null;
      current = { id: `S${sessions.length + 1}`, date, part: head[1] === "오전" ? "am" : "pm", subject, units: [] };
      sessions.push(current);
      dropped.push(u.id);
    } else if (!current || LAST_EDIT.test(u.text.trim())) {
      dropped.push(u.id); // 표지 · 날짜 바로 아래 과목 배지 · 마지막 수정
    } else {
      current.units.push(u);
    }
  }

  const kept = sessions.filter((s) => s.units.some((u) => u.type === "body"));
  for (const s of sessions) if (!kept.includes(s)) dropped.push(...s.units.map((u) => u.id));
  return { sessions: kept, dropped };
}

/** '영어(선유반)' → '영어'. 반 이름은 OCR 이 흔들리고(선유반/선윤반) 학기마다 바뀌므로 뺀다. '기타'는 과목이 아니다. */
export function subjectName(raw: string): string | null {
  const name = raw.replace(/\(.*\)\s*$/, "").trim();
  if (!name || name === "기타") return null;
  // 알려진 과목으로 시작하면 뒤에 붙은 반 이름은 뗀다: '국어A반'·'과학4반'(OCR 이 A 를 4 로) → '국어'·'과학'
  const known = KNOWN_SUBJECTS.find((k) => name.startsWith(k) && !/^[가-힣]/.test(name.slice(k.length)));
  return known ?? name;
}
/** 길이가 긴 것부터 (기술가정 → 기술 순서로 맞추기 위해) */
const KNOWN_SUBJECTS = ["기술가정", "주제중심", "제2외국어", "국어", "수학", "영어", "사회", "과학", "역사", "한국사", "체육", "음악", "미술", "기술", "정보", "도덕", "윤리"];

/** '2026년 8월 26일 수요일' → '2026-08-26' */
export function toIsoDate(text: string): string | null {
  const m = text.match(/(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  return m ? `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}` : null;
}

/** 노트 본문: 고른 단위를 원래 순서대로 한 줄씩. AI 요약이 아니라 원문이다. */
export function noteText(units: GcamUnit[], ids: string[]): string {
  const pick = new Set(ids);
  return units.filter((u) => pick.has(u.id)).map((u) => u.text.trim()).join("\n");
}

/**
 * AI 묶음을 "모든 단위가 정확히 한 번"이 되도록 바로잡는다. 다시 묻지 않고 규칙으로 고친다.
 *   - S번호는 그 칸의 단위들로 펼친다. 단, 어딘가에 U번호로 직접 적힌 단위는 그쪽이 우선
 *   - 겹치면 먼저 나온 묶음에 둔다 / 없는 ID 는 버린다
 *   - 칸의 일부만 빠졌으면(주로 소제목) 같은 칸에서 바로 앞 단위가 든 묶음에 붙인다. 앞이 없으면 바로 뒤 단위 쪽
 *   - 칸 전체가 빠졌으면 missing 으로 돌려준다 (부르는 쪽이 미분류로 보관 — 기록을 버리지 않는다)
 * fixes: 고친 내역 (품질 확인용 기록)
 */
export function resolveAssignment(sessions: Session[], groups: string[][]) {
  const bySession = new Map(sessions.map((s) => [s.id, s.units.map((u) => u.id)]));
  const valid = new Set([...bySession.values()].flat());
  const explicit = new Set(groups.flat().filter((id) => valid.has(id)));
  const seen = new Set<string>();
  const fixes: string[] = [];

  const resolved = groups.map((ids) =>
    ids
      .flatMap((id) => (bySession.has(id) ? bySession.get(id)!.filter((u) => !explicit.has(u)) : [id]))
      .filter((id) => {
        if (!valid.has(id)) return fixes.push(`없는 단위 ${id}`), false;
        if (seen.has(id)) return fixes.push(`중복 ${id}`), false;
        return seen.add(id), true;
      }),
  );
  const groupOf = new Map(resolved.flatMap((ids, g) => ids.map((id) => [id, g] as const)));
  const missing: { session: Session; ids: string[] }[] = [];
  for (const s of sessions) {
    const ids = s.units.map((u) => u.id);
    const lost = ids.filter((id) => !groupOf.has(id));
    if (!lost.length) continue;
    if (lost.length === ids.length) {
      missing.push({ session: s, ids: lost });
      fixes.push(`빠짐 ${lost.join(",")}`);
      continue;
    }
    // 앞에서부터 채우면 연속으로 빠진 단위도 앞 단위의 묶음을 따라간다
    ids.forEach((id, i) => {
      if (groupOf.has(id)) return;
      const near = ids.slice(0, i).reverse().find((x) => groupOf.has(x)) ?? ids.slice(i + 1).find((x) => groupOf.has(x))!;
      const g = groupOf.get(near)!;
      groupOf.set(id, g);
      fixes.push(`붙임 ${id}→${near}`);
    });
  }
  // 원래 순서대로 다시 모은다
  const order = new Map([...bySession.values()].flat().map((id, i) => [id, i]));
  const regrouped = resolved.map((_, g) => [...groupOf].filter(([, x]) => x === g).map(([id]) => id).sort((a, b) => order.get(a)! - order.get(b)!));
  return { groups: regrouped, missing, fixes };
}

/** AI 가 돌려준 묶음이 입력 단위를 정확히 한 번씩 썼는지 검사한다. 문제가 없으면 빈 배열. */
export function checkAssignment(inputIds: string[], groups: string[][]): string[] {
  const expected = new Set(inputIds);
  const seen = new Set<string>();
  const problems: string[] = [];
  for (const id of groups.flat()) {
    if (!expected.has(id)) problems.push(`없는 단위 ${id}`);
    else if (seen.has(id)) problems.push(`중복 ${id}`);
    seen.add(id);
  }
  for (const id of expected) if (!seen.has(id)) problems.push(`빠짐 ${id}`);
  return problems;
}

/**
 * 노트마다 거캠 칸 키 "gcam:{날짜}:{am|pm}:{칸 안 순번}". 순번은 칸 안에서 첫 단위가 앞선 노트부터 0, 1, …
 * 다시 올린 PDF는 U번호가 새로 붙으므로, 키는 U번호가 아니라 날짜·칸으로 만든다. 날짜를 못 읽은 칸은 null (항상 새로 만든다).
 */
export function sourceKeys(sessions: Session[], notes: string[][]): (string | null)[] {
  const where = new Map(sessions.flatMap((s) => s.units.map((u, i) => [u.id, { s, i }] as const)));
  const keys = notes.map(() => null as string | null);
  const firsts = notes.map((ids, n) => ({ n, at: where.get(ids[0]) })).filter((x) => x.at);
  for (const same of Map.groupBy(firsts, (x) => x.at!.s).values()) {
    same.sort((a, b) => a.at!.i - b.at!.i);
    same.forEach((x, k) => {
      if (x.at!.s.date) keys[x.n] = `gcam:${x.at!.s.date}:${x.at!.s.part}:${k}`;
    });
  }
  return keys;
}
