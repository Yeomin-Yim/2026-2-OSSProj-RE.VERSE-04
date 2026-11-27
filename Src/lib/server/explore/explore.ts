import { axisIdf, forRecommend, LENS_LABEL, lensScores, profileWeights, type LensKey, type LensResult, type ProjectTags, type Profile, type RuleDict } from "@/lib/core/index.ts";
import type { Db } from "../auth";
import { matching, tagLabel } from "../keywords/meta";
import { postingKeyword, postingNodes, searchPostings } from "./postings";

/**
 * 진로 탐색 그래프에 쓰는 실제 추천 데이터.
 *   학과: major_profiles 점수표 × 내 프로젝트 태그 → scoreProfiles (lib/core/recommend)
 *         내 기록의 공통 축(A:…, 키워드에 의미로 붙인 것) 또는 규칙 태그와 점수표의 축 코드를 맞춘다 (lib/core/keywords/vocabulary)
 *   대학: universities (학과 코드별 개설 대학, 점수 없음)
 *   직무: job_profiles 점수표 × 내 프로젝트 태그 → scoreProfiles
 *   채용공고: 추천 직무 이름으로 사람인 채용공고 검색 (SARAMIN_ACCESS_KEY 가 있을 때만, lib/server/explore/postings.ts)
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
  /** 종합 관점 추천 (= lenses.overall) */
  children: ExNode[];
  /** 관점별 추천 (lib/core/recommend/lenses.ts). 같은 학과·직무는 관점이 달라도 같은 id */
  lenses?: Partial<Record<LensKey, ExNode[]>>;
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
  axisWeight?: (code: string) => number,
  selfChosen?: Set<string>,
  max = 5,
): { side: ExploreSide; picked: ProfileRow[] } {
  const root = { ...ROOTS[kind], evidence: projectTags.map((p) => p.id) };
  const profiles = latest(rows);
  const base = { root, next: {}, profileCount: profiles.length };
  if (!profiles.length) return { side: { ...base, children: [], status: "no-profiles" }, picked: [] };
  if (!projectTags.some((p) => p.tags.size)) return { side: { ...base, children: [], status: "no-records" }, picked: [] };

  const byId = new Map(profiles.map((p) => [p.id, p]));
  const lens = lensScores(projectTags, profiles.map<Profile>((p) => ({ id: p.id, weights: profileWeights(p.weights) })), { idf: axisWeight, selfChosen, max });
  // 축 칸은 그 축을 붙게 한 내 키워드를 함께 보여 준다 ("설문·표본 조사 ← 설문 문항, 인터뷰")
  const label = (code: string) => tagLabel(code, dict) + (via.get(code)?.length ? ` ← ${via.get(code)!.slice(0, 2).join(", ")}` : "");
  const prefix = kind === "college" ? "m:" : "j:";
  const why: Record<LensKey, (r: LensResult) => string> = {
    overall: (r) => `내 기록이 이 점수표의 ${r.matched.length}칸을 채웠어요. 넓이 ${r.breadth} · 깊이 ${r.depth}.`,
    repeated: (r) => `여러 프로젝트에서 되풀이해 온 활동 ${r.matched.length}가지가 이 ${kind === "college" ? "학과" : "직무"}에서 하는 일과 겹쳐요. 거의 모든 학생이 하는 활동은 덜 셌어요.`,
    deep: (r) => `한 프로젝트를 깊게 한 경험이 이 점수표의 핵심 칸을 채웠어요. 깊이 ${r.depth}.`,
    interest: (r) => `내가 다뤄 온 주제 ${r.matched.length}가지가 이 ${kind === "college" ? "학과" : "직무"}가 다루는 주제와 겹쳐요${selfChosen?.size ? " (스스로 고른 개인주제 프로젝트 기준)" : ""}.`,
  };
  const toNode = (k: LensKey) => (r: LensResult): ExNode => {
    const p = byId.get(r.profile_id)!;
    return {
      id: prefix + p.id,
      kind: "recommend",
      label: p.name,
      sub: `${LENS_LABEL[k]} ${Math.round(r.score)}`,
      desc: why[k](r),
      score: Math.round(r.score),
      breadth: r.breadth,
      depth: r.depth,
      tags: r.matched.slice(0, 6).map(label),
      evidence: r.evidence,
      scrapType: kind === "college" ? "major" : "job",
    };
  };
  const lenses = Object.fromEntries((Object.keys(lens) as LensKey[]).map((k) => [k, lens[k].map(toNode(k))])) as Record<LensKey, ExNode[]>;
  // 깊게 해 본 것이 종합과 순서까지 같으면(프로젝트가 적은 학생) 탭을 비활성화한다: 같은 목록을 두 번 보여 주지 않는다
  const ids = (k: LensKey) => lens[k].map((r) => r.profile_id).join(",");
  if (ids("deep") === ids("overall")) lenses.deep = [];
  const children = lenses.overall;
  const pickedIds = [...new Set(Object.values(lens).flat().map((r) => r.profile_id))];
  return {
    side: { ...base, children, lenses, status: children.length ? "ready" : "no-match" },
    picked: pickedIds.map((id) => byId.get(id)!),
  };
}

const UNIS_PER_MAJOR = 8;
const uniRank = (u: { name: string; area: string | null }) => (u.name.startsWith("동국대") ? 0 : u.area?.startsWith("서울") ? 1 : 2);

/**
 * axisSources: 축 코드 → 그 축을 붙게 한 내 키워드 이름들 (화면에 "설문·표본 조사 ← 설문 문항" 처럼 근거를 보여 준다)
 */
/** selfChosen: 학생이 스스로 고른 개인주제 프로젝트 id (관심 관점의 기준) */
export async function loadExplore(db: Db, projectTags: ProjectTags[], dict: RuleDict, axisSources: Map<string, string[]> = new Map(), selfChosen?: Set<string>): Promise<ExploreData> {
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
  // 많은 점수표에 공통인 축은 가볍게 (학과·직무 전체로 계산)
  const idf = axisIdf([...majorRows, ...jobRows].map((p) => ({ weights: profileWeights(p.weights) })));
  const college = side("college", majorRows, mine, dict, axisSources, idf, selfChosen);
  const career = side("career", jobRows, mine, dict, axisSources, idf, selfChosen);

  // 추천 학과의 개설 대학
  const codes = college.picked.map((p) => p.code);
  if (codes.length) {
    // 학과마다 따로 읽는다 (한 번에 읽으면 1000행 제한에 걸려 뒤쪽 학과가 잘린다)
    const parts = await Promise.all(codes.map((c) => db.from("universities").select("id, major_code, name, campus, area, url").eq("major_code", c).limit(1000)));
    const failed = parts.find((r) => r.error);
    if (failed?.error) throw new Error(failed.error.message);
    const data = parts.flatMap((r) => r.data ?? []);
    for (const m of college.picked) {
      const parent = "m:" + m.id;
      const major = Object.values(college.side.lenses ?? {}).flat().find((c) => c.id === parent)!;
      college.side.next[parent] = (data as { id: string; major_code: string; name: string; campus: string | null; area: string | null; url: string | null }[])
        .filter((u) => u.major_code === m.code)
        // 한 학과에 수백 곳이라 그래프에는 몇 곳만: 동국대 → 서울 → 나머지 (같은 순위는 이름순)
        .sort((x, y) => uniRank(x) - uniRank(y) || x.name.localeCompare(y.name, "ko"))
        .slice(0, UNIS_PER_MAJOR)
        .map((u) => ({
          id: "u:" + u.id,
          kind: "target",
          label: u.name,
          sub: [m.name, u.campus, u.area].filter(Boolean).join(" · "),
          desc: "이 학과(또는 비슷한 학과)가 개설된 대학이에요. 커리어넷 학과 정보 기준이고, 전형·모집 인원은 모집요강에서 직접 확인하세요.",
          evidence: major.evidence,
          parentId: parent,
          url: u.url,
          scrapType: "university",
        }));
    }
  }
  // 추천 직무의 채용공고 (키가 없거나 실패하면 빈 목록 → 화면은 "준비 중")
  if (process.env.SARAMIN_ACCESS_KEY && career.side.children.length) {
    const jobs = [...new Map(Object.values(career.side.lenses ?? {}).flat().map((j) => [j.id, j])).values()];
    const lists = await Promise.all(jobs.map((job) => searchPostings(postingKeyword(job.label))));
    jobs.forEach((job, i) => {
      if (lists[i].length) career.side.next[job.id] = postingNodes(job, lists[i]);
    });
  }
  return { college: college.side, career: career.side, demo: false };
}
