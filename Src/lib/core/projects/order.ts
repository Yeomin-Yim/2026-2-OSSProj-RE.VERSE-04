import { isSubjectProject } from "../keywords/axes.ts";

/**
 * 프로젝트 목록 순서 (판단기록 D24): 거캠 가져오기 뒤 과목 프로젝트 7개 + 일반 활동이 진짜 프로젝트 사이에 섞이던 문제.
 *   main  : 팀·개인주제 프로젝트, 최근 것부터 (끝난 날 → 시작한 날, 날짜 없으면 뒤로)
 *   other : 과목 수업·일반 활동 (접어 두는 묶음), 이름순
 */
export function orderProjects<T extends { title: string; start_date: string | null; end_date: string | null }>(projects: T[]): { main: T[]; other: T[] } {
  const when = (p: T) => p.end_date ?? p.start_date ?? "";
  const main = projects.filter((p) => !isSubjectProject(p.title)).sort((a, b) => when(b).localeCompare(when(a)));
  const other = projects.filter((p) => isSubjectProject(p.title)).sort((a, b) => a.title.localeCompare(b.title, "ko"));
  return { main, other };
}
