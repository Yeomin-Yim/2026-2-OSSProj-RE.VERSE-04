import { redirect } from "next/navigation";
import { EmptyProjects } from "@/components/projects/EmptyProjects";
import { requireUser } from "@/lib/server/auth";
import { listProjects } from "@/lib/server/projects";

/** 프로젝트가 있으면 첫 프로젝트로, 없으면 안내 화면 */
export default async function ProjectsPage() {
  const { supabase } = await requireUser();
  const projects = await listProjects(supabase);
  if (projects.length) redirect(`/projects/${projects[0].id}`);
  return <EmptyProjects />;
}
