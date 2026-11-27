// 거캠 회고록 가져오기: OCR 결과 → 프로젝트·노트 초안.
// 상대 경로로 불러온다: 터미널 시험 스크립트(node)에서도 그대로 쓰기 위해서.

import { checkAssignment, parseSessions, resolveAssignment, type GcamUnit, type Session } from "../../core/gcam-import/gcam.ts";
import type { Usage } from "../openai.ts";
import { CLASS_SUBJECTS, groupSessions, type ExistingProject } from "./group.ts";

export interface DraftNote {
  title: string;
  date: string | null;
  unit_ids: string[];
}

export interface DraftProject {
  title: string;
  /** 이어 쌓을 기존 프로젝트. null 이면 새로 만든다 */
  existing_project_id: string | null;
  origin: "subject" | "ai";
  notes: DraftNote[];
  questions: string[];
}

/** 프로젝트가 아닌 활동을 모으는 프로젝트. 과목 프로젝트처럼 학기 구분 없이 하나로 축적한다 */
export const GENERAL_PROJECT = "일반 활동";

export interface Draft {
  projects: DraftProject[];
  /**
   * 프로젝트가 아닌 노트. 옮기지 않으면 '일반 활동'으로 저장한다.
   *   kind school: 학교생활·행사 (묻지 않음) · unsure: 학생에게 확인 (candidates 첫째가 추천)
   *   kind 가 없으면(이전 초안) unsure 로 본다
   */
  unassigned: (DraftNote & { candidates: string[]; question: string; kind?: "school" | "unsure" })[];
  /** 활동이 없던 날(아픔·결석·"딱히 없음"). 저장하지 않지만 화면에서 되살릴 수 있다 */
  skipped?: (DraftNote & { reason: string })[];
  /** 학생의 기존 '일반 활동' 프로젝트. null 이면 확정할 때 새로 만든다 */
  general_project_id: string | null;
  excluded: { unit_ids: string[]; reason: string }[];
}

/**
 * 오전 과목 칸은 코드가 과목 프로젝트('국어' 등, 학기 구분 없이 축적)에 넣고,
 * 나머지 칸은 AI 가 묶는다. AI 결과가 단위를 빠뜨리거나 겹치면 다시 묻지 않고 규칙으로 바로잡는다(resolveAssignment).
 */
export async function buildDraft(units: GcamUnit[], existing: ExistingProject[]) {
  const { sessions, dropped } = parseSessions(units);
  const unitText = new Map(units.map((u) => [u.id, u.text]));
  const sessionOf = new Map(sessions.flatMap((s) => s.units.map((u) => [u.id, s] as const)));
  const firstDate = (ids: string[]) => sessionOf.get(ids[0])?.date ?? null;
  /** 단위 목록을 칸별로 나눈다 (칸 순서 유지) */
  const bySession = (ids: string[]) => [...Map.groupBy(ids, (id) => sessionOf.get(id)!.id).values()];

  const draft: Draft = {
    projects: [],
    unassigned: [],
    skipped: [],
    general_project_id: existing.find((p) => p.title.trim() === GENERAL_PROJECT)?.id ?? null,
    excluded: [{ unit_ids: dropped, reason: "머리글·빈 칸·마지막 수정" }],
  };

  // ① 과목 칸 → 과목 프로젝트
  for (const s of sessions.filter((s) => s.subject)) {
    let project = draft.projects.find((p) => p.origin === "subject" && p.title === s.subject);
    if (!project) {
      const same = existing.find((p) => p.title.trim() === s.subject);
      project = { title: s.subject!, existing_project_id: same?.id ?? null, origin: "subject", notes: [], questions: [] };
      draft.projects.push(project);
    }
    project.notes.push({ title: firstLine(s), date: s.date, unit_ids: s.units.map((u) => u.id) });
  }

  // ② 나머지 칸 → AI
  const rest = sessions.filter((s) => !s.subject);
  const restIds = new Set(rest.flatMap((s) => s.units.map((u) => u.id)));
  const usage: Usage[] = [];
  if (rest.length) {
    // 과목·일반 활동 프로젝트는 코드 담당이라 AI 에게 보이지 않는다 (보이면 '기타' 칸을 '국어'에 붙이곤 했다)
    const subjects = new Set([...draft.projects.map((p) => p.title), GENERAL_PROJECT]);
    const aiExisting = existing.filter((p) => !subjects.has(p.title.trim()));
    const { json, usage: u } = await groupSessions(sessionsText(rest), aiExisting);
    const notes = json.projects.flatMap((p) => p.notes);
    // 묶음 순서: 프로젝트 노트 → 미분류 → 제외. 겹치면 앞쪽이 이긴다
    const { groups, missing, fixes } = resolveAssignment(rest, [
      ...notes.map((n) => n.unit_ids),
      ...json.unassigned.map((n) => n.unit_ids),
      ...json.excluded.map((e) => e.unit_ids),
    ]);
    usage.push(fixes.length ? { ...u, problems: fixes.slice(0, 10) } : u);
    const next = () => groups.shift()!;
    const known = new Set(aiExisting.map((p) => p.id));

    for (const p of json.projects) {
      draft.projects.push({
        title: p.title,
        // 다른 학생의 프로젝트나 없는 id 로 이어 붙이지 않는다
        existing_project_id: p.existing_project_id && known.has(p.existing_project_id) ? p.existing_project_id : null,
        origin: "ai",
        // 노트는 한 칸을 넘지 않는다: AI 가 여러 칸을 합쳤으면 칸마다 나눈다
        notes: p.notes.flatMap((n) => bySession(next()).map((ids) => ({ title: n.title, date: firstDate(ids), unit_ids: ids }))),
        questions: p.questions,
      });
    }
    // 종류에 따라 자리를 정한다: 교과 수업 → 과목 프로젝트 · 활동 없는 날 → 저장 안 함 · 학교생활 → 일반 활동(묻지 않음) · 애매함 → 학생 확인
    const titles = new Set([...draft.projects.map((p) => p.title.trim()), ...aiExisting.map((p) => p.title.trim())]);
    for (const n of json.unassigned) {
      for (const ids of bySession(next())) {
        const note = { title: n.title, date: firstDate(ids), unit_ids: ids };
        const subject = n.kind === "class" ? classSubject(n.subject) : null;
        if (subject) addToSubject(draft, existing, subject, note);
        else if (n.kind === "empty") draft.skipped!.push({ ...note, reason: "활동이 없던 날" });
        else if (n.kind === "school" || n.kind === "class") draft.unassigned.push({ ...note, kind: "school", candidates: [], question: "" });
        else {
          // 후보는 실제로 있는 프로젝트 이름만 (없는 이름을 추천하지 않게)
          const candidates = n.candidates.map((c) => c.trim()).filter((c) => titles.has(c));
          draft.unassigned.push({ ...note, kind: "unsure", candidates, question: n.question });
        }
      }
    }
    for (const e of json.excluded) draft.excluded.push({ ...e, unit_ids: next() });
    for (const m of missing) {
      // AI 가 빠뜨린 칸: 뚜렷한 말이 있으면 규칙으로 자리를 정하고, 아니면 학생에게 묻는다
      const note = { title: firstLine(m.session), date: m.session.date, unit_ids: m.ids };
      const text = m.session.units.map((u) => u.text).join(" ");
      if (EMPTY_DAY.test(text) && text.length < 120) draft.skipped!.push({ ...note, reason: "활동이 없던 날" });
      else if (SCHOOL_EVENT.test(note.title) && !PROJECT_FLOW.test(note.title)) draft.unassigned.push({ ...note, kind: "school", candidates: [], question: "" });
      else draft.unassigned.push({ ...note, kind: "unsure", candidates: [], question: "어느 프로젝트의 기록인가요?" });
    }

    // 바로잡은 뒤에는 모든 단위가 정확히 한 번이어야 한다 (어기면 코드 버그)
    const fromAi = (n: DraftNote) => n.unit_ids.every((id) => restIds.has(id));
    const all = [...draft.projects.flatMap((p) => p.notes).filter(fromAi), ...draft.unassigned, ...draft.skipped!, ...draft.excluded.slice(1)];
    const left = checkAssignment(rest.flatMap((s) => s.units.map((x) => x.id)), all.map((g) => g.unit_ids));
    if (left.length) throw new Error(`초안 검증 실패: ${left.slice(0, 3).join(", ")}`);
  }
  // 안전장치 (판단기록 G1): 학교생활로 분류됐어도 프로젝트 진행 말이 있으면 학생에게 확인한다 (묻지 않고 넘어가는 칸이라 잘못 들어가면 놓친다)
  for (const n of draft.unassigned) if (n.kind === "school" && PROJECT_FLOW.test(n.title) && !SCHOOL_EVENT.test(n.title)) Object.assign(n, { kind: "unsure", question: "프로젝트 진행 기록 같아요. 어느 프로젝트에 둘까요?" });
  // 확인할 노트에 후보가 없으면, 그날 진행 중이던 프로젝트를 날짜로 찾아 추천한다
  const textOf = (ids: string[]) => ids.map((id) => unitText.get(id) ?? "").join(" ");
  for (const n of draft.unassigned) {
    if (n.kind !== "unsure") continue;
    const text = `${n.title} ${textOf(n.unit_ids)}`;
    // 학교 행사 말이 뚜렷하고 프로젝트 진행 말이 없으면 묻지 않는다
    if (SCHOOL_EVENT.test(n.title) && !PROJECT_FLOW.test(n.title)) { Object.assign(n, { kind: "school", candidates: [], question: "" }); continue; }
    // 후보가 없으면 날짜·겹치는 말로 찾고, 있으면 같은 기준으로 순서만 다시 맞춘다 (첫째가 '추천' 버튼)
    n.candidates = n.candidates.length
      ? n.candidates.map((c, i) => ({ c, i, w: overlap(c, text) })).sort((a, b) => b.w - a.w || a.i - b.i).map((x) => x.c)
      : activeProjects(draft, n.date, text);
  }
  // 바로잡는 과정에서 단위를 모두 잃은 노트는 뺀다
  for (const p of draft.projects) p.notes = p.notes.filter((n) => n.unit_ids.length);
  draft.projects = draft.projects.filter((p) => p.notes.length);
  draft.unassigned = draft.unassigned.filter((n) => n.unit_ids.length);
  draft.skipped = draft.skipped!.filter((n) => n.unit_ids.length);
  // 과목 노트는 날짜순 (오후 칸에서 온 과목 노트가 섞여 들어오므로)
  for (const p of draft.projects) if (p.origin === "subject") p.notes.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
  draft.excluded = draft.excluded.filter((e) => e.unit_ids.length);
  return { draft, usage };
}

/** 프로젝트 진행 단계로 보이는 말 (학교생활 안전장치) */
const PROJECT_FLOW = /인터뷰|리서치|설문|현장\s?관찰|팀\s?(활동|회의|대화|프로젝트|빌딩)|발표\s?(준비|리허설|대본|연습)|팀\s?발표|포스터|부스\s?준비|프로토타입|시제품|(중간|종합|1차|2차)\s?피드백|피드백\s?반영|문제\s?(정의|해결)|아이디어|솔루션|중간\s?발표|종피/u;
/** 프로젝트 말이 있어도 학교 행사인 것 */
const SCHOOL_EVENT = /목표\s?설정|부스\s?체험|총회|학생\s?자치|자치회|오리엔테이션|\bOT\b|설명회|강연|특강|체육\s?대회|운동회|소풍|현장\s?체험|축제|해커톤\s?수업|미니\s?수업/u;
/** 활동이 없던 날 */
const EMPTY_DAY = /아파서|아팠|병\s?조퇴|조퇴|결석|쉬는\s?날|딱히\s?없|한\s?(것|게)\s?없|기록할\s?(것|게)\s?없/u;

const TEAM_WORDS = /팀\s?(대화|활동|회의|프로젝트|빌딩)|팀원|팀플|AEIOU|현장\s?관찰|문제\s?정의|이해관계자|되어\s?보기|저니\s?맵|페르소나/iu;
const PERSONAL_WORDS = /개주프|개인\s?주제|개인\s?성장|나를\s?찾는/u;
/** 제목의 말(두 글자 이상) 중 노트 글에 나오는 수. 개주프 노트는 개인주제 프로젝트와 강하게 맞춘다 */
export function overlap(projectTitle: string, text: string): number {
  const words = projectTitle.split(/[\s·,()]+/).filter((w) => w.length >= 2 && !/프로젝트|팀|문제|해결/.test(w));
  const hits = words.filter((w) => text.includes(w)).length;
  const personal = PERSONAL_WORDS.test(projectTitle);
  // 개주프 말이면 개인주제 프로젝트, 팀 말(팀 대화·팀원·팀 프로젝트)이면 팀 프로젝트 쪽으로 (말차 2학기: "팀 대화"가 개주프로 추천됐다)
  const toPersonal = PERSONAL_WORDS.test(text) ? (personal ? 3 : -1) : 0;
  const toTeam = TEAM_WORDS.test(text) ? (personal ? -2 : 2) : 0;
  return hits + toPersonal + toTeam;
}

/** 그 날짜 앞뒤(7일)에 노트가 있는 AI 프로젝트 제목. 노트 글과 겹치는 말이 많은 순, 같으면 날짜가 가까운 순 */
function activeProjects(draft: Draft, date: string | null, text = "", max = 2): string[] {
  const day = (d: string) => Date.parse(d) / 86_400_000;
  const scored = draft.projects
    .filter((p) => p.origin === "ai" && p.notes.length)
    .map((p) => {
      const ds = p.notes.map((n) => n.date).filter((d): d is string => !!d).map(day);
      if (!date || !ds.length) return { title: p.title, gap: 1000 - p.notes.length, words: overlap(p.title, text) };
      const t = day(date), lo = Math.min(...ds), hi = Math.max(...ds);
      const gap = t >= lo && t <= hi ? Math.min(...ds.map((x) => Math.abs(x - t))) / 100 : Math.min(Math.abs(t - lo), Math.abs(t - hi));
      return { title: p.title, gap, words: overlap(p.title, text) };
    })
    .filter((x) => !date || x.gap <= 7 || x.words >= 2)
    .sort((a, b) => b.words - a.words || a.gap - b.gap);
  return scored.slice(0, max).map((x) => x.title);
}

/** AI 가 고른 과목 이름 → 과목 프로젝트 이름 (모르는 과목이면 null: 학교생활로 둔다) */
function classSubject(raw: string | null): string | null {
  const s = (raw ?? "").replace(/\s|수업|시간/g, "");
  return (CLASS_SUBJECTS as readonly string[]).find((x) => s.startsWith(x)) ?? null;
}

/** 과목 프로젝트에 노트를 더한다. 이번 초안에 없으면 만든다 (같은 이름의 기존 프로젝트가 있으면 거기에 이어서) */
function addToSubject(draft: Draft, existing: ExistingProject[], subject: string, note: DraftNote) {
  let project = draft.projects.find((p) => p.origin === "subject" && p.title === subject);
  if (!project) {
    project = { title: subject, existing_project_id: existing.find((p) => p.title.trim() === subject)?.id ?? null, origin: "subject", notes: [], questions: [] };
    draft.projects.push(project);
  }
  project.notes.push(note);
}

/**
 * AI 입력: "[S3] 2026-08-27 오후" + "U0042 내용" 줄들.
 * 칸 하나가 길면 단위마다 앞부분만 보낸다: 어느 프로젝트인지는 앞 몇 문장으로 충분하고, 입력이 짧을수록 묶기가 빠르다 (판단기록 D22)
 */
const SESSION_CHARS = Number(process.env.GCAM_SESSION_CHARS ?? 0) || Infinity;
function sessionsText(sessions: Session[]): string {
  return sessions
    .map((s) => {
      const per = Math.max(60, Math.floor(SESSION_CHARS / Math.max(1, s.units.length)));
      const lines = s.units.map((u) => `${u.id} ${u.text.length > per ? u.text.slice(0, per) + "…" : u.text}`);
      return [`[${s.id}] ${s.date ?? "날짜 없음"} ${s.part === "am" ? "오전" : "오후"}`, ...lines].join("\n");
    })
    .join("\n\n");
}

/** 과목 노트 제목: 첫 본문의 첫 문장 (미리보기에서 학생이 고칠 수 있다) */
function firstLine(s: Session): string {
  const body = s.units.find((u) => u.type === "body")?.text ?? "";
  const first = body.split(/(?<=[.!?])\s/)[0];
  return first.length > 40 ? `${first.slice(0, 40)}…` : first;
}
