import { ScrapsView } from "@/components/scraps/ScrapsView";
import { StudentProvider } from "@/components/student/StudentData";
import { requireUser } from "@/lib/server/auth";
import { listScraps } from "@/lib/server/student/scraps";
import { listTodos } from "@/lib/server/student/todos";

/** 스크랩 (프로토타입 #/scraps). 데이터는 scraps · todos 표. */
export default async function ScrapsPage() {
  const { supabase } = await requireUser();
  const [scraps, todos] = await Promise.all([listScraps(supabase), listTodos(supabase)]);
  return (
    <StudentProvider initialScraps={scraps} initialTodos={todos}>
      <ScrapsView />
    </StudentProvider>
  );
}
