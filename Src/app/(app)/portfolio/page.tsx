import { PortfolioWizard, type PickProject } from "@/components/portfolio/PortfolioWizard";
import { checkProject, isTemplateId, type PortfolioSource } from "@/lib/core/index.ts";
import { getDisplayName, requireUser } from "@/lib/server/auth";
import { loadDictionary } from "@/lib/server/dictionary";
import { listProjects, listRecords } from "@/lib/server/projects";
import { getPortfolio, listOverviews } from "@/lib/server/student/portfolio";

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/**
 * 포트폴리오 만들기 (프로토타입 #/portfolio/1~3)
 *   ?step=1|2|3  ?type=portfolio-project|altform-dongguk-2027 (연결 그래프의 준비 정보에서 들어올 때)
 * 데이터: 내 프로젝트 · 기록 · 개요 · 기록 확인(그때그때 계산) + portfolios 표(저장)
 */
export default async function PortfolioPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const { supabase } = await requireUser();
  const [projects, records, overviews, portfolio, { dict }, userName] = await Promise.all([
    listProjects(supabase),
    listRecords(supabase),
    listOverviews(supabase),
    getPortfolio(supabase),
    loadDictionary(supabase),
    getDisplayName(),
  ]);

  const picks: PickProject[] = projects.map((p) => {
    const mine = records.filter((r) => r.project_id === p.id);
    const count = new Map<string, number>();
    for (const r of mine) for (const t of r.tags) count.set(t.code, (count.get(t.code) ?? 0) + 1);
    const source: PortfolioSource = {
      id: p.id,
      title: p.title,
      topic: p.topic,
      start_date: p.start_date,
      end_date: p.end_date,
      overview: overviews[p.id] ?? {},
      records: [...mine].reverse().map((r) => ({ id: r.id, title: r.title, text: r.raw_text })),
      tags: [...count].sort((a, b) => b[1] - a[1]).map(([code]) => dict.tags[code]?.label ?? code),
    };
    return { ...p, checks: checkProject({ start_date: p.start_date, end_date: p.end_date, records: mine }), source };
  });

  const type = one(sp.type);
  const step = Math.min(3, Math.max(1, Number(one(sp.step)) || 1));
  return (
    <PortfolioWizard
      projects={picks}
      initial={portfolio}
      initialStep={step as 1 | 2 | 3}
      initialType={isTemplateId(type) && type !== "portfolio-profile" ? type : null}
      userName={userName}
    />
  );
}
