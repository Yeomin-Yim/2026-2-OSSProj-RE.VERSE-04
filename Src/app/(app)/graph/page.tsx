import Link from "next/link";
import { requireUser } from "@/lib/server/auth";
import { loadDictionary } from "@/lib/server/dictionary";
import { latestRelations } from "@/lib/server/graph";
import { listProjects } from "@/lib/server/projects";

/**
 * 연결 그래프. 지금은 계산된 연결선을 목록으로 보여 준다.
 * TODO: 프로토타입처럼 그림(force-graph)으로 그리기
 */
export default async function GraphPage() {
  const { supabase } = await requireUser();
  const [projects, { relations, threshold }, { dict }] = await Promise.all([
    listProjects(supabase),
    latestRelations(supabase),
    loadDictionary(supabase),
  ]);

  const titleOf = (id: string) => projects.find((p) => p.id === id)?.title ?? "(삭제된 프로젝트)";
  const sorted = [...relations].sort((a, b) => b.score - a.score);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="title">연결 그래프</h1>
          <p className="subtitle">
            공통 태그로 계산한 프로젝트 사이의 연결이에요. 점수 {threshold} 이상이면 연결선으로 봐요.
          </p>
        </div>
      </div>

      <div className="card panel">
        {sorted.length === 0 && <div className="empty-note">아직 계산된 연결이 없어요. 기록을 저장하면 계산돼요.</div>}
        {sorted.map((r) => (
          <div key={r.a + r.b} className={"rel-row" + (r.score < threshold ? " weak" : "")}>
            <div className="score">{r.score.toFixed(2)}</div>
            <div>
              <b>
                <Link href={`/projects/${r.a}`}>{titleOf(r.a)}</Link> — <Link href={`/projects/${r.b}`}>{titleOf(r.b)}</Link>
              </b>
              <div>
                {r.shared.map((code) => (
                  <span key={code} className={"tag-chip " + (dict.tags[code]?.group ?? "")}>
                    {dict.tags[code]?.label ?? code}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
