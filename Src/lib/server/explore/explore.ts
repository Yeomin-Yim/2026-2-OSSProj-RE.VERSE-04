import { forRecommend, MIN_TOTAL, profileWeights, scoreProfiles, type ProjectTags, type Profile, type RuleDict } from "@/lib/core/index.ts";
import type { Db } from "../auth";
import { matching, tagLabel } from "../keywords/meta";

/**
 * 진로 탐색 그래프에 쓰는 실제 추천 데이터.
 *   학과: major_profiles 점수표 × 내 프로젝트 태그 → scoreProfiles (lib/core/recommend)
 *         내 기록의 공통 축(A:…, 키워드에 의미로 붙인 것) 또는 규칙 태그와 점수표의 축 코드를 맞춘다 (lib/core/keywords/vocabulary)
 *   대학: universities (학과 코드별 개설 대학, 점수 없음)
 *   직무: job_profiles 점수표 × 내 프로젝트 태그 → scoreProfiles
 *   채용공고: 아직 표·수집 기능이 없다 → 항상 빈 목록
 * 점수표가 비어 있으면 화면은 "준비 중" 안내를 보여 준다. 예시 데이터로 채우지 않는다.
 */

export type ExKind = "root" | "recommend" | "target" | "posting" | "info";

export interface ExNode {
  id: string;
  kind: ExKind;
  label: string;
  sub: string;
  desc?: string;
  /** 추천 점수 (0~100). 대학·준비 정보에는 없다 */
  score?: number;
  breadth?: number;
  depth?: number;
  tags?: string[];
  /** 근거가 된 내 프로젝트 id */
  evidence: string[];
  /** 대학 → 학과 id, 채용공고 → 직무 id */
  parentId?: string;
  url?: string | null;
  /** 준비 정보: 포트폴리오 서식으로 이어지기 / 체크리스트 */
  tpl?: "portfolio-project" | "altform-dongguk-2027";
  action?: "todo";
  /** 스크랩할 때 쓰는 DB 종류 (시연 모드에서는 없음) */
  scrapType?: "major" | "job" | "university";
  /** 채용공고 상세 (시연 모드에서만) */
  posting?: { company: string; title: string; location: string; deadline: string; requirements: string[]; preferred: string[]; summary: string };
}

export interface ExploreSide {
  root: ExNode;
  children: ExNode[];
  /** 학과 id → 대학 목록, 직무 id → 채용공고 목록 */
  next: Record<string, ExNode[]>;
  /** ready: 추천 있음 · no-profiles: 점수표 미수집 · no-match: 점수표는 있으나 내 기록과 겹치는 칸 없음 · no-records: 태그된 기록 없음 */
  status: "ready" | "no-profiles" | "no-match" | "no-records";
  profileCount: number;
}

export interface ExploreData { college: ExploreSide; career: ExploreSide; demo: boolean }

export const ROOTS = {
  college: { id: "college-root", kind: "root", label: "대학 진학", sub: "프로젝트 기반 학과 탐색", evidence: [] } as ExNode,
  career: { id: "career-root", kind: "root", label: "취업", sub: "프로젝트 기반 직무 탐색", evidence: [] } as ExNode,
};

/** 같은 code 의 점수표가 여러 버전이면 가장 최근 버전만 */
function latest<T extends { code: string; profile_version: string }>(rows: T[]): T[] {
  const best = new Map<string, T>();
  for (const r of rows) {
    const cur = best.get(r.code);
    if (!cur || r.profile_version > cur.profile_version) best.set(r.code, r);
  }
  return [...best.values()];
}

interface ProfileRow { id: string; code: string; name: string; weights: Record<string, number>; profile_version: string }

function side(
  kind: "college" | "career",
  rows: ProfileRow[],
  projectTags: ProjectTags[],
  dict: RuleDict,
  via: Map<string, string[]> = new Map(),
  max = 5,
): { side: ExploreSide; picked: ProfileRow[] } {
  const root = { ...ROOTS[kind], evidence: projectTags.map((p) => p.id) };
  const profiles = latest(rows);
  const base = { root, next: {}, profileCount: profiles.length };
  if (!profiles.length) return { side: { ...base, children: [], status: "no-profiles" }, picked: [] };
  if (!projectTags.some((p) => p.tags.size)) return { side: { ...base, children: [], status: "no-records" }, picked: [] };

  const recs = scoreProfiles(projectTags, profiles.map<Profile>((p) => ({ id: p.id, weights: profileWeights(p.weights) })), { minTotal: MIN_TOTAL }).slice(0, max);
  const byId = new Map(profiles.map((p) => [p.id, p]));
  // 축 칸은 그 축을 붙게 한 내 키워드를 함께 보여 준다 ("설문·표본 조사 ← 설문 문항, 인터뷰")
  const label = (code: string) => tagLabel(code, dict) + (via.get(code)?.length ? ` ← ${via.get(code)!.slice(0, 2).join(", ")}` : "");
  const prefix = kind === "college" ? "m:" : "j:";
  const children = recs.map<ExNode>((r) => {
    const p = byId.get(r.profile_id)!;
    const filled = r.cells.filter((c) => Object.keys(c.hits).length);
    // 근거 프로젝트: 채운 칸의 무게 합이 큰 순서
    const contrib = new Map<string, number>();
    for (const c of filled) for (const pid of Object.keys(c.hits)) contrib.set(pid, (contrib.get(pid) ?? 0) + c.weight);
    return {
      id: prefix + p.id,
      kind: "recommend",
      label: p.name,
      sub: `일치도 ${r.score}`,
      desc: `점수표 ${r.cells.length}칸 중 ${filled.length}칸을 내 기록이 채웠어요. 넓이 ${r.breadth} · 깊이 ${r.depth}.`,
      score: Math.round(r.score),
      breadth: r.breadth,
      depth: r.depth,
      tags: filled.sort((a, b) => b.weight - a.weight).slice(0, 6).map((c) => label(c.tag)),
      evidence: [...contrib].sort((a, b) => b[1] - a[1]).map(([pid]) => pid),
      scrapType: kind === "college" ? "major" : "job",
    };
  });
  return {
    side: { ...base, children, status: children.length ? "ready" : "no-match" },
    picked: recs.map((r) => byId.get(r.profile_id)!),
  };
}

/**
 * axisSources: 축 코드 → 그 축을 붙게 한 내 키워드 이름들 (화면에 "설문·표본 조사 ← 설문 문항" 처럼 근거를 보여 준다)
 */
export async function loadExplore(db: Db, projectTags: ProjectTags[], dict: RuleDict, axisSources: Map<string, string[]> = new Map()): Promise<ExploreData> {
  const cols = "id, code, name, weights, profile_version";
  const [majors, jobs] = await Promise.all([
    db.from("major_profiles").select(cols),
    db.from("job_profiles").select(cols),
  ]);
  if (majors.error) throw new Error(majors.error.message);
  if (jobs.error) throw new Error(jobs.error.message);

  const majorRows = latest(majors.data as ProfileRow[]);
  const jobRows = latest(jobs.data as ProfileRow[]);
  const mine = forRecommend(projectTags, matching());
  const college = side("college", majorRows, mine, dict, axisSources);
  const career = side("career", jobRows, mine, dict, axisSources);

  // 추천 학과의 개설 대학
  const codes = college.picked.map((p) => p.code);
  if (codes.length) {
    const { data, error } = await db.from("universities").select("id, major_code, name, campus, area, url").in("major_code", codes);
    if (error) throw new Error(error.message);
    for (const m of college.picked) {
      const parent = "m:" + m.id;
      const major = college.side.children.find((c) => c.id === parent)!;
      college.side.next[parent] = (data as { id: string; major_code: string; name: string; campus: string | null; area: string | null; url: string | null }[])
        .filter((u) => u.major_code === m.code)
        .map((u) => ({
          id: "u:" + u.id,
          kind: "target",
          label: u.name,
          sub: [m.name, u.campus, u.area].filter(Boolean).join(" · "),
          desc: "이 학과가 개설된 대학이에요. 전형·모집 인원은 모집요강에서 직접 확인하세요.",
          evidence: major.evidence,
          parentId: parent,
          url: u.url,
          scrapType: "university",
        }));
    }
  }
  return { college: college.side, career: career.side, demo: false };
}
