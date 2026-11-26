import Link from "next/link";
import { buildDemoExplore } from "@/components/explore/demo";
import { ExploreGraph, type ExplorePlace } from "@/components/explore/ExploreGraph";
import styles from "@/components/explore/explore.module.css";
import { GraphView } from "@/components/graph/GraphView";
import { StudentProvider } from "@/components/student/StudentData";
import { requireUser } from "@/lib/server/auth";
import { loadDictionary } from "@/lib/server/dictionary";
import { loadExplore } from "@/lib/server/explore/explore";
import { keywordCategories, tagInfoFor } from "@/lib/server/keywords/meta";
import { axisOf, isAxisCode } from "@/lib/core/index.ts";
import { latestRelations } from "@/lib/server/graph";
import { listProjects, listRecords, toProjectTags } from "@/lib/server/projects";
import { listGraphNotes } from "@/lib/server/student/notes";
import { listScraps } from "@/lib/server/student/scraps";
import { listTodos } from "@/lib/server/student/todos";

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/**
 * 연결 그래프 (프로토타입 #/learning)
 *   기본: 진로 탐색 그래프 (대학 진학 / 취업) — 추천은 점수표 × 내 기록 태그, 노트·스크랩·체크리스트는 DB
 *   ?view=links : 프로젝트 간 연결 그래프 (latestRelations, 서버 계산값 그대로)
 *   ?demo=1     : 시연 모드 (프로토타입 예시 데이터, 저장 안 함)
 *   ?mode=&path=&sel=&note=&project= : 스크랩의 '원래 위치로 이동'
 */
export default async function GraphPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const { supabase, userId } = await requireUser();
  const view = one(sp.view) === "links" ? "links" : "explore";
  const demo = one(sp.demo) === "1";

  const head = (
    <div className="page-head">
      <div>
        <h1 className="title">연결 그래프</h1>
        <p className="subtitle">
          {view === "links"
            ? "공통 태그로 계산한 프로젝트 사이의 연결이에요."
            : "노드를 눌러 탐색하고, 내 프로젝트에 노트를 연결해요."}
        </p>
      </div>
      {view === "explore" && <span className="sample-badge">{demo ? "시연 모드 · 예시 데이터" : "추천 = 점수표 × 내 기록 키워드"}</span>}
    </div>
  );
  const tabs = (
    <nav className={styles.modeTabs} aria-label="그래프 종류">
      <Link href="/graph" className={view === "explore" ? "on" : ""}>진로 탐색</Link>
      <Link href="/graph?view=links" className={view === "links" ? "on" : ""}>프로젝트 연결</Link>
    </nav>
  );

  if (view === "links") {
    const { dict } = await loadDictionary(supabase);
    const [projects, { relations, threshold }, cats] = await Promise.all([listProjects(supabase), latestRelations(supabase), keywordCategories(supabase)]);
    const tagInfo = tagInfoFor(new Set(relations.flatMap((r) => r.shared)), dict, cats);
    return (
      <div className="page lm">
        {head}
        {tabs}
        <p className="subtitle" style={{ margin: "-4px 0 12px" }}>
          유사도 {threshold.toFixed(2)} 이상이면 연결선으로 이어요. 연결이 없는 프로젝트는 따로 떨어진 점으로 보여요.
        </p>
        <GraphView
          projects={projects}
          relations={relations.map(({ a, b, score, shared }) => ({ a, b, score, shared }))}
          threshold={threshold}
          tagInfo={tagInfo}
        />
      </div>
    );
  }

  const { dict } = await loadDictionary(supabase);
  const [projects, records, notes, scraps, todos, profile] = await Promise.all([
    listProjects(supabase),
    listRecords(supabase),
    listGraphNotes(supabase),
    listScraps(supabase),
    listTodos(supabase),
    supabase.from("profiles").select("ui_state").eq("id", userId).maybeSingle(),
  ]);
  // 축 → 그 축을 붙게 한 내 키워드 이름 (추천 근거 표시용)
  const axisSources = new Map<string, string[]>();
  for (const t of records.flatMap((r) => r.tags)) {
    if (!isAxisCode(t.code)) continue;
    const list = axisSources.get(axisOf(t.code)) ?? [];
    if (!list.includes(t.matched)) list.push(t.matched);
    axisSources.set(axisOf(t.code), list);
  }
  const data = demo
    ? buildDemoExplore(projects)
    : await loadExplore(supabase, toProjectTags(records).filter((p) => projects.some((q) => q.id === p.id)), dict, axisSources);

  // 처음 위치: 주소(스크랩에서 이동) > 저장된 마지막 위치 (시연 모드는 항상 처음부터)
  const saved = (profile.data?.ui_state?.career ?? {}) as Partial<ExplorePlace>;
  const fromUrl = one(sp.mode);
  const asMode = (m: unknown) => (m === "college" || m === "career" ? m : null);
  const place: ExplorePlace = fromUrl
    ? { mode: asMode(fromUrl), path: one(sp.path).split(",").filter(Boolean), sel: one(sp.sel) || null }
    : demo
      ? { mode: null, path: [], sel: null }
      : { mode: asMode(saved.mode), path: Array.isArray(saved.path) ? saved.path : [], sel: saved.sel ?? null };
  const open = { note: one(sp.note) || undefined, project: one(sp.project) || undefined };

  return (
    <div className="page lm">
      {head}
      {tabs}
      {demo && (
        <div className={styles.demoBand} role="note">
          <b>시연 모드</b>
          <span>학과·대학·직무·채용공고는 중간 체크인 프로토타입의 <b>예시 데이터</b>예요. 실제 추천이 아니며, 스크랩·체크리스트는 저장하지 않아요. 노트는 실제로 저장돼요.</span>
          <Link className="btn sm" href="/graph">실제 데이터로 돌아가기</Link>
        </div>
      )}
      <StudentProvider initialScraps={scraps} initialTodos={todos} readOnly={demo}>
        <ExploreGraph key={demo ? "demo" : "real"} data={data} projects={projects} notes={notes} place={place} open={open} />
      </StudentProvider>
    </div>
  );
}
