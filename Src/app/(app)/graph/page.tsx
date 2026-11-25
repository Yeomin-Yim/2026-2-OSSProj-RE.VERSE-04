import { GraphView } from "@/components/graph/GraphView";
import { requireUser } from "@/lib/server/auth";
import { loadDictionary } from "@/lib/server/dictionary";
import { latestRelations } from "@/lib/server/graph";
import { listProjects } from "@/lib/server/projects";

/**
 * 연결 그래프. 데이터는 여기(서버)서 읽고, 그림과 상호작용은 GraphView(화면)가 맡는다.
 * 연결선·유사도·공통 태그·기준값은 가장 최근 계산 결과(analysis_runs)를 그대로 넘긴다.
 */
export default async function GraphPage() {
  const { supabase } = await requireUser();
  const [projects, { relations, threshold }, { dict }] = await Promise.all([
    listProjects(supabase),
    latestRelations(supabase),
    loadDictionary(supabase),
  ]);

  // 화면에 필요한 태그 정보만 넘긴다 (연결에 나온 태그)
  const codes = new Set(relations.flatMap((r) => r.shared));
  const tagInfo = Object.fromEntries(
    [...codes].filter((code) => dict.tags[code]).map((code) => [code, { label: dict.tags[code].label, group: dict.tags[code].group }]),
  );

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="title">연결 그래프</h1>
          <p className="subtitle">
            공통 태그로 계산한 프로젝트 사이의 연결이에요. 유사도 {threshold.toFixed(2)} 이상이면 연결선으로 이어요.
          </p>
        </div>
      </div>

      <GraphView
        projects={projects}
        relations={relations.map(({ a, b, score, shared }) => ({ a, b, score, shared }))}
        threshold={threshold}
        tagInfo={tagInfo}
      />
    </div>
  );
}
