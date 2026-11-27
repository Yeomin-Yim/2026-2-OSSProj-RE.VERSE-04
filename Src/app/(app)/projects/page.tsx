import { redirect } from "next/navigation";
import { EmptyProjects } from "@/components/projects/EmptyProjects";
import { requireUser } from "@/lib/server/auth";
import { listProjects } from "@/lib/server/projects";
import { orderProjects } from "@/lib/core/index.ts";

/** 프로젝트가 있으면 가장 최근의 팀·개인주제 프로젝트로 (과목 '국어'가 먼저 열리지 않게), 없으면 안내 화면 */
export default async function ProjectsPage() {
  const { supabase } = await requireUser();
  const projects = await listProjects(supabase);
  const { main, other } = orderProjects(projects);
  const first = main[0] ?? other[0];
  if (first) redirect(`/projects/${first.id}`);
  return <EmptyProjects />;
}
