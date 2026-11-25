// 거캠 회고록 가져오기: OCR 결과 → 프로젝트·노트 초안.
// 상대 경로로 불러온다: 터미널 시험 스크립트(node)에서도 그대로 쓰기 위해서.

import { checkAssignment, parseSessions, resolveAssignment, type GcamUnit, type Session } from "../../core/gcam-import/gcam.ts";
import type { Usage } from "../openai.ts";
import { groupSessions, type ExistingProject } from "./group.ts";

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
  /** 학생이 확정 전 팝업에서 다른 프로젝트로 옮길 수 있다. 옮기지 않으면 '일반 활동'으로 저장 */
  unassigned: (DraftNote & { candidates: string[]; question: string })[];
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
  const sessionOf = new Map(sessions.flatMap((s) => s.units.map((u) => [u.id, s] as const)));
  const firstDate = (ids: string[]) => sessionOf.get(ids[0])?.date ?? null;
  /** 단위 목록을 칸별로 나눈다 (칸 순서 유지) */
  const bySession = (ids: string[]) => [...Map.groupBy(ids, (id) => sessionOf.get(id)!.id).values()];

  const draft: Draft = {
    projects: [],
    unassigned: [],
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
    for (const n of json.unassigned) {
      for (const ids of bySession(next())) draft.unassigned.push({ ...n, unit_ids: ids, date: firstDate(ids) });
    }
    for (const e of json.excluded) draft.excluded.push({ ...e, unit_ids: next() });
    for (const m of missing) {
      draft.unassigned.push({ title: firstLine(m.session), date: m.session.date, unit_ids: m.ids, candidates: [], question: "어느 프로젝트의 기록인가요?" });
    }

    // 바로잡은 뒤에는 모든 단위가 정확히 한 번이어야 한다 (어기면 코드 버그)
    const all = [...draft.projects.filter((p) => p.origin === "ai").flatMap((p) => p.notes), ...draft.unassigned, ...draft.excluded.slice(1)];
    const left = checkAssignment(rest.flatMap((s) => s.units.map((x) => x.id)), all.map((g) => g.unit_ids));
    if (left.length) throw new Error(`초안 검증 실패: ${left.slice(0, 3).join(", ")}`);
  }
  // 바로잡는 과정에서 단위를 모두 잃은 노트는 뺀다
  for (const p of draft.projects) p.notes = p.notes.filter((n) => n.unit_ids.length);
  draft.projects = draft.projects.filter((p) => p.notes.length);
  draft.unassigned = draft.unassigned.filter((n) => n.unit_ids.length);
  draft.excluded = draft.excluded.filter((e) => e.unit_ids.length);
  return { draft, usage };
}

/** AI 입력: "[S3] 2026-08-27 오후" + "U0042 내용" 줄들 */
function sessionsText(sessions: Session[]): string {
  return sessions
    .map((s) => [`[${s.id}] ${s.date ?? "날짜 없음"} ${s.part === "am" ? "오전" : "오후"}`, ...s.units.map((u) => `${u.id} ${u.text}`)].join("\n"))
    .join("\n\n");
}

/** 과목 노트 제목: 첫 본문의 첫 문장 (미리보기에서 학생이 고칠 수 있다) */
function firstLine(s: Session): string {
  const body = s.units.find((u) => u.type === "body")?.text ?? "";
  const first = body.split(/(?<=[.!?])\s/)[0];
  return first.length > 40 ? `${first.slice(0, 40)}…` : first;
}
