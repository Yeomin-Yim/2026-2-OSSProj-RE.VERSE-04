import { Sidebar } from "@/components/shell/Sidebar";
import { Topbar } from "@/components/shell/Topbar";
import { ToastProvider } from "@/components/ui/Toast";
import { getDisplayName, requireUser } from "@/lib/server/auth";
import { listProjects } from "@/lib/server/projects";

/** 로그인 뒤 화면의 공통 틀: 왼쪽 메뉴 + 위쪽 바 (프로토타입의 .app 구조) */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase } = await requireUser();
  const [userName, projects] = await Promise.all([getDisplayName(), listProjects(supabase)]);

  return (
    <ToastProvider>
      <div className="app">
        <Sidebar />
        <div className="main">
          <Topbar userName={userName} projects={projects.map(({ id, title, topic }) => ({ id, title, topic }))} />
          <main>{children}</main>
        </div>
      </div>
    </ToastProvider>
  );
}
