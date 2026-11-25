import { notFound } from "next/navigation";
import { ProjectsView } from "@/components/projects/ProjectsView";
import { checkProject, groupByCode, nextQuestions } from "@/lib/core/index.ts";
import { getDisplayName, requireUser } from "@/lib/server/auth";
import { loadDictionary } from "@/lib/server/dictionary";
import { getOverview, listProjects, listRecords } from "@/lib/server/projects";
import { StudentProvider } from "@/components/student/StudentData";
import { listGraphNotes } from "@/lib/server/student/notes";
import { listScraps } from "@/lib/server/student/scraps";
import { listTodos } from "@/lib/server/student/todos";

export default async function ProjectPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const { tab } = await searchParams;
  const { supabase } = await requireUser();

  // 서로 기다릴 필요가 없는 조회는 한꺼번에 보낸다
  const [projects, records, overview, { dict }, userName, graphNotes, scraps, todos] = await Promise.all([
    listProjects(supabase),
    listRecords(supabase, id),
    getOverview(supabase, id),
    loadDictionary(supabase),
    getDisplayName(),
    listGraphNotes(supabase),
    listScraps(supabase),
    listTodos(supabase),
  ]);

  const project = projects.find((p) => p.id === id);
  if (!project) notFound();

  // 기록 확인 7항목과 보완 제안은 저장하지 않고 그때그때 계산한다
  const checks = checkProject({ start_date: project.start_date, end_date: project.end_date, records });
  const projectTags = [...groupByCode(records.flatMap((r) => r.tags))].map(([code, sids]) => ({
    code,
    count: sids.length,
  }));
  const tagInfo = Object.fromEntries(
    Object.entries(dict.tags).map(([code, tag]) => [code, { label: tag.label, group: tag.group }]),
  );

  return (
    <StudentProvider initialScraps={scraps} initialTodos={todos}>
    <ProjectsView
      key={id}
      projects={projects}
      project={project}
      records={records}
      overview={overview}
      checks={checks}
      guides={nextQuestions(checks)}
      projectTags={projectTags}
      tagInfo={tagInfo}
      userName={userName}
      graphNotes={graphNotes}
      initialTab={tab === "gnotes" || tab === "overview" || tab === "log" || tab === "result" ? tab : "files"}
    />
    </StudentProvider>
  );
}
