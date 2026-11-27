import { axisIdf, forRecommend, LENS_LABEL, lensScores, profileWeights, type AxisLensKey, type LensKey, type LensResult, type ProjectTags, type Profile, type RuleDict } from "@/lib/core/index.ts";
import type { Db } from "../auth";
import { matching, tagLabel } from "../keywords/meta";
import { postingKeyword, postingNodes, searchPostings } from "./postings";
import { publicPostingsForJobs, type PublicPostingWithFiles } from "./publicPostings";
import type { SimilarPick, SimilarState } from "./similar";

/**
 * 진로 탐색 그래프에 쓰는 실제 추천 데이터.
 *   학과: major_profiles 점수표 × 내 프로젝트 태그 → scoreProfiles (lib/core/recommend)
 *         내 기록의 공통 축(A:…, 키워드에 의미로 붙인 것) 또는 규칙 태그와 점수표의 축 코드를 맞춘다 (lib/core/keywords/vocabulary)
 *   대학: universities (학과 코드별 개설 대학, 점수 없음)
 *   직무: job_profiles 점수표 × 내 프로젝트 태그 → scoreProfiles
 *   채용공고: 공공기관 진행 중 공고를 직무에 맞춰 최신순 (public_postings 표, Supabase 가 하루 1번 수집 · 판단기록 D31·D32)
 *            사람인 키(SARAMIN_ACCESS_KEY)가 있으면 민간 공고도 덧붙인다. 둘 다 없으면 사람인·잡코리아 검색 링크만
 * 점수표가 비어 있으면 화면은 "준비 중" 안내를 보여 준다. 예시 데이터로 채우지 않는다.
 */

export type ExKind = "root" | "recommend" | "target" | "posting" | "info";

export interface ExNode {
  id: string;
  kind: ExKind;
  label: string;
  sub: string;
  desc?: string;
  /** 커리어넷 코드 (학과 → 개설 대학 찾기, 직무 → 공고 찾기에 쓴다) */
  code?: string;
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
  /** 밖으로 나가는 링크 (예: 직무 → 사람인·잡코리아 공고 검색). 공고 API 가 없어도 바로 찾아볼 수 있게 */
  links?: { label: string; url: string }[];
  /** 준비 정보: 포트폴리오 서식으로 이어지기 / 체크리스트 */
  tpl?: "portfolio-project" | "altform-dongguk-2027";
  action?: "todo";
  /** 스크랩할 때 쓰는 DB 종류 (시연 모드에서는 없음) */
  scrapType?: "major" | "job" | "university";
  /** 대학: 거캠(검정고시·대안학교) 학생 지원 가능 정보 (admission_rules, 모집요강 원문 기준 · 판단기록 D37) */
  admission?: {
    tone: "alt" | "ok" | "unknown";
    badge: string;
    tracks: { track: string; altForm: string | null; note: string; page: string | null }[];
    sourceUrl: string | null;
    checkedAt: string | null;
  };
  /** 채용공고 상세 */
  posting?: {
    company: string; title: string; location: string; deadline: string; requirements: string[]; preferred: string[]; summary: string;
    /** 공공기관(잡알리오) · 사람인 · 예시 */
    source?: "public" | "saramin";
    /** 공고 시작일 YYYY-MM-DD (최신순 정렬 기준) */
    start?: string;
    /** 학력무관·고졸 가능·신입 등 */
    badges?: string[];
    /** 고졸·학력무관으로 지원 가능 */
    openToHighSchool?: boolean;
    stages?: string[];
    /** 이 공고에서 만든 체크리스트 기본 항목 */
    checklist?: string[];
    files?: { name: string; url: string; kind: string }[];
  };
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
  const why: Record<AxisLensKey, (r: LensResult) => string> = {
    overall: (r) => `내 기록과 ${r.matched.length}가지가 겹쳐요`,
    repeated: (r) => `여러 번 해 온 활동 ${r.matched.length}가지가 겹쳐요`,
    deep: () => `한 프로젝트를 깊게 한 경험이 겹쳐요`,
    interest: (r) => `다뤄 온 주제 ${r.matched.length}가지가 겹쳐요`,
  };
  const toNode = (k: AxisLensKey) => (r: LensResult): ExNode => {
    const p = byId.get(r.profile_id)!;
    return {
      id: prefix + p.id,
      kind: "recommend",
      code: p.code,
      label: p.name,
      sub: `${LENS_LABEL[k]} ${Math.round(r.score)}`,
      desc: why[k](r),
      score: Math.round(r.score),
      breadth: r.breadth,
      depth: r.depth,
      tags: r.matched.slice(0, 6).map(label),
      evidence: r.evidence,
      scrapType: kind === "college" ? "major" : "job",
      links: kind === "career" ? jobSearchLinks(p.name) : undefined,
    };
  };
  const lenses = Object.fromEntries((Object.keys(lens) as AxisLensKey[]).map((k) => [k, lens[k].map(toNode(k))])) as Partial<Record<LensKey, ExNode[]>>;
  // 깊게 해 본 것이 종합과 순서까지 같으면(프로젝트가 적은 학생) 탭을 비활성화한다: 같은 목록을 두 번 보여 주지 않는다
  const ids = (k: AxisLensKey) => lens[k].map((r) => r.profile_id).join(",");
  if (ids("deep") === ids("overall")) lenses.deep = [];
  const children = lenses.overall ?? [];
  const pickedIds = [...new Set(Object.values(lens).flat().map((r) => r.profile_id))];
  return {
    side: { ...base, children, lenses, status: children.length ? "ready" : "no-match" },
    picked: pickedIds.map((id) => byId.get(id)!),
  };
}

/** 직무 이름으로 공고 검색 링크 (판단기록 D30): 사람인 키가 없거나 공고가 0건이어도 학생이 바로 찾아볼 수 있게 */
function jobSearchLinks(jobName: string): { label: string; url: string }[] {
  const q = encodeURIComponent(postingKeyword(jobName));
  return [
    { label: "사람인에서 공고 찾기", url: `https://www.saramin.co.kr/zf_user/search/recruit?searchword=${q}` },
    { label: "잡코리아에서 공고 찾기", url: `https://www.jobkorea.co.kr/Search/?stext=${q}` },
  ];
}

/**
 * "기록과 닮은" 노드를 관점에 넣는다. 점수표가 있는 학과·직무면 같은 id 를 써서(관점을 바꿔도 같은 노드) 스크랩·노트가 이어진다.
 * 이유는 AI 가 쓴 한 문장, 근거 프로젝트는 AI 가 고른 프로젝트.
 */
function addSimilar(side: ExploreSide, kind: "college" | "career", picks: SimilarPick[], rows: ProfileRow[], mine: Set<string>) {
  if (!picks.length) return;
  const prefix = kind === "college" ? "m:" : "j:";
  const byCode = new Map(latest(rows).map((r) => [r.code, r]));
  const nodes: ExNode[] = picks.map((p) => {
    const prof = byCode.get(p.code);
    return {
      id: prefix + (prof ? prof.id : "c" + p.code),
      kind: "recommend",
      code: p.code,
      label: p.name,
      sub: "기록과 닮은",
      desc: p.reason,
      evidence: p.projects.filter((id) => mine.has(id)),
      url: `https://www.career.go.kr/cloud/w/${kind === "college" ? "major/uView" : "job/view"}?seq=${p.code}`,
      scrapType: kind === "college" ? "major" : "job",
      links: kind === "career" ? jobSearchLinks(p.name) : undefined,
    };
  });
  side.lenses = { ...(side.lenses ?? {}), similar: nodes };
  // 점수표로는 겹치는 곳이 없던 학생도 닮은 추천은 보여 준다
  if (!side.children.length) {
    side.children = nodes;
    if (side.status === "no-match" || side.status === "no-profiles") side.status = "ready";
  }
}

/** 공공기관 공고 → 그래프 노드. 등록일을 앞에 (최신순), 마감은 원문에서 학생이 관리 (D31) */
function publicNodes(job: ExNode, items: PublicPostingWithFiles[]): ExNode[] {
  const md = (d: string) => d.slice(5).replace("-", "/");
  return items.map((p) => ({
    id: `p:${job.id}:alio${p.id}`,
    kind: "posting",
    label: p.org,
    sub: p.title,
    desc: `${p.region} · ${md(p.start)} 등록`,
    evidence: [],
    parentId: job.id,
    url: p.url,
    posting: {
      company: p.org,
      title: p.title,
      location: p.region,
      deadline: p.end,
      requirements: p.requirements,
      preferred: p.preferred,
      summary: [p.hireType, p.career].filter(Boolean).join(" · "),
      source: "public",
      start: p.start,
      badges: p.badges,
      openToHighSchool: p.openToHighSchool,
      stages: p.stages,
      checklist: p.checklist,
      files: p.files,
    },
  }));
}

const UNIS_PER_MAJOR = 8;
type Admission = NonNullable<ExNode["admission"]>;
const admRank = (a?: Admission) => (a?.tone === "alt" ? 0 : a?.tone === "ok" ? 1 : 2);

/**
 * 대학별 거캠 학생 지원 정보: 검정고시로 지원 가능(ged_ok=true)한 수시 전형만 근거로 쓴다.
 * "불가"는 대학 단위로 말하지 않는다 — 추출이 전형을 빠뜨렸을 수 있으므로, 확인된 "가능"만 보여 준다 (D37).
 */
async function admissionsFor(db: Db, names: string[]): Promise<Map<string, Admission>> {
  const out = new Map<string, Admission>();
  if (!names.length) return out;
  // 한글 대학 이름 100여 개를 한 번에 넣으면 주소가 너무 길어 요청이 실패한다 → 30개씩
  const parts = await Promise.all(Array.from({ length: Math.ceil(names.length / 30) }, (_, i) => db.from("admission_rules")
    .select("university, track, track_type, ged_ok, alt_form, alt_school, note, source_url, source_page, checked_at")
    .in("university", names.slice(i * 30, i * 30 + 30)).eq("year", 2027).eq("ged_ok", true)));
  const failed = parts.find((r) => r.error);
  if (failed?.error) { console.warn("모집요강 정보를 읽지 못했어요:", failed.error.message); return out; }
  const data = parts.flatMap((r) => r.data ?? []);
  type R = { university: string; track: string; track_type: string; alt_form: string | null; alt_school: boolean; note: string; source_url: string; source_page: string | null; checked_at: string };
  const by = new Map<string, R[]>();
  for (const r of (data ?? []) as R[]) by.set(r.university, [...(by.get(r.university) ?? []), r]);
  for (const [u, rows] of by) {
    const alt = rows.filter((r) => r.alt_school);
    const jong = rows.filter((r) => r.track_type === "종합" && !r.alt_school);
    // 검정고시 성적으로 지원하는 교과전형도 거캠 학생에게 실제 선택지 (한신대 참인재 등, D39). 논술·실기는 대부분 열려 있어 배지 근거로 쓰지 않는다
    const gyo = rows.filter((r) => r.track_type === "교과" && !r.alt_school);
    const show = [...alt, ...jong, ...gyo].slice(0, 4);
    out.set(u, {
      tone: alt.length ? "alt" : jong.length || gyo.length ? "ok" : "unknown",
      badge: alt.length ? "대안학교 출신 전형 있음" : jong.length && gyo.length ? "검정고시로 학생부종합·교과 지원 가능" : jong.length ? "검정고시로 학생부종합 지원 가능" : gyo.length ? "검정고시로 교과전형 지원 가능" : "",
      tracks: show.map((r) => ({ track: r.track, altForm: r.alt_form, note: r.note, page: r.source_page })),
      sourceUrl: rows[0].source_url,
      checkedAt: rows.map((r) => r.checked_at).sort().at(-1) ?? null,
    });
  }
  return out;
}
const uniRank = (u: { name: string; area: string | null }) => (u.name.startsWith("동국대") ? 0 : u.area?.startsWith("서울") ? 1 : 2);

/**
 * axisSources: 축 코드 → 그 축을 붙게 한 내 키워드 이름들 (화면에 "설문·표본 조사 ← 설문 문항" 처럼 근거를 보여 준다)
 */
/** selfChosen: 학생이 스스로 고른 개인주제 프로젝트 id (관심 관점의 기준) */
export async function loadExplore(db: Db, projectTags: ProjectTags[], dict: RuleDict, axisSources: Map<string, string[]> = new Map(), selfChosen?: Set<string>, similar: SimilarState | null = null): Promise<ExploreData> {
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

  // "기록과 닮은" 관점: 커리어넷 전체에서 임베딩으로 넓게 모으고 AI 가 고른 결과 (similar.ts, 판단기록 D35). 저장된 결과만 읽는다
  const mineIds = new Set(projectTags.map((p) => p.id));
  if (similar) {
    addSimilar(college.side, "college", similar.major, majorRows, mineIds);
    addSimilar(career.side, "career", similar.job, jobRows, mineIds);
  }

  // 추천 학과(모든 관점)의 개설 대학
  const majorNodes = [...new Map(Object.values(college.side.lenses ?? {}).flat().filter((n) => n.code).map((n) => [n.id, n])).values()];
  const codes = [...new Set(majorNodes.map((n) => n.code!))];
  if (codes.length) {
    // 학과마다 따로 읽는다 (한 번에 읽으면 1000행 제한에 걸려 뒤쪽 학과가 잘린다)
    const parts = await Promise.all(codes.map((c) => db.from("universities").select("id, major_code, name, campus, area, url").eq("major_code", c).limit(1000)));
    const failed = parts.find((r) => r.error);
    if (failed?.error) throw new Error(failed.error.message);
    const data = parts.flatMap((r) => r.data ?? []) as { id: string; major_code: string; name: string; campus: string | null; area: string | null; url: string | null }[];
    // 거캠 학생 지원 가능 정보 (대학 단위로 한 번에)
    const univName = (n: string) => /^(\S*?대학교)(\s|$)/.exec(n)?.[1] ?? null;
    const names = [...new Set(data.map((u) => univName(u.name)).filter((x): x is string => !!x))];
    const adm = await admissionsFor(db, names);
    for (const major of majorNodes) {
      college.side.next[major.id] = data
        .filter((u) => u.major_code === major.code)
        // 다른 캠퍼스(이름에 "…캠퍼스")는 모집요강이 따로일 수 있어 본교 정보를 붙이지 않는다 (동국대 WISE 등)
        // 본교(제1캠퍼스)만 모집요강 정보를 붙인다. 다른 캠퍼스(제2캠퍼스, 이름에 "…캠퍼스")는 모집요강이 따로라 붙이면
        //   고려대 세종이 서울 정보를 받는 식의 "거짓 가능"이 생긴다 (D38)
        .map((u) => ({ u, a: /캠퍼스/.test(u.name) || (u.campus && u.campus !== "제1캠퍼스") ? undefined : adm.get(univName(u.name) ?? "") }))
        // 거캠 학생 기준 정렬: 대안학교 전형 → 검정고시로 학종 가능 → 나머지, 그다음 동국대 → 서울 → 이름순
        .sort((x, y) => admRank(x.a) - admRank(y.a) || uniRank(x.u) - uniRank(y.u) || x.u.name.localeCompare(y.u.name, "ko"))
        // 한 대학이 칸을 다 차지하지 않게 대학당 2곳까지
        .filter(((seen) => ({ u }: { u: { name: string } }) => {
          const k = univName(u.name) ?? u.name;
          seen.set(k, (seen.get(k) ?? 0) + 1);
          return seen.get(k)! <= 2;
        })(new Map<string, number>()))
        .slice(0, UNIS_PER_MAJOR)
        .map(({ u, a }) => ({
          id: "u:" + u.id,
          kind: "target",
          label: u.name,
          sub: [major.label, u.campus, u.area].filter(Boolean).join(" · "),
          desc: a?.badge ? `${a.badge} · ${a.checkedAt ? "모집요강 확인 " + a.checkedAt : "모집요강 기준"}` : "이 학과(또는 비슷한 학과)가 있는 대학이에요 · 커리어넷 기준",
          evidence: major.evidence,
          parentId: major.id,
          url: u.url,
          scrapType: "university",
          admission: a ?? { tone: "unknown", badge: "", tracks: [], sourceUrl: null, checkedAt: null },
        }));
    }
  }
  // 추천 직무의 채용공고: 공공기관(진행 중, 최신순) + 사람인(키가 있을 때). 실패하면 빈 목록 → 화면은 검색 링크
  if (career.side.children.length) {
    const jobs = [...new Map(Object.values(career.side.lenses ?? {}).flat().map((j) => [j.id, j])).values()];
    const [pub, pri] = await Promise.all([
      publicPostingsForJobs(db, jobs.map((job) => ({ name: job.label, code: job.code }))),
      Promise.all(jobs.map((job) => (process.env.SARAMIN_ACCESS_KEY ? searchPostings(postingKeyword(job.label)) : Promise.resolve([])))),
    ]);
    jobs.forEach((job, i) => {
      const nodes = [...publicNodes(job, pub[i].items), ...postingNodes(job, pri[i])];
      if (nodes.length) career.side.next[job.id] = nodes;
    });
  }
  return { college: college.side, career: career.side, demo: false };
}
