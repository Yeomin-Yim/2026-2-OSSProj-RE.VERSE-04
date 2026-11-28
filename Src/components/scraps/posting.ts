// 채용공고 스크랩 (D016): DB·서버를 바꾸지 않고, 허용된 "job" 타입에 ref_id "posting:<공고 노드 id>" 로 저장한다.
// meta.kind = "posting" 과 공고 정보(회사·제목·지역·마감·원문 주소·직무 id)를 같이 담아 스크랩 화면이 공고로 보여 준다.

import type { ExNode } from "@/lib/server/explore/explore";
import type { Scrap, ScrapInput } from "@/lib/server/student/scraps";

export const POSTING_PREFIX = "posting:";

export interface PostingMeta {
  sub?: string;
  kind: "posting";
  company: string;
  title: string;
  location: string;
  deadline: string;
  url: string | null;
  source?: "public" | "saramin";
  jobId: string | null;
  jobLabel?: string;
}

export const isPostingScrap = (s: Pick<Scrap, "type" | "ref_id">) => s.type === "job" && s.ref_id.startsWith(POSTING_PREFIX);
/** 그래프 공고 체크리스트와 같은 키 */
export const postingTodoKey = (s: Pick<Scrap, "ref_id">) => s.ref_id;
export const postingMeta = (s: Scrap) => s.meta as unknown as PostingMeta;

/** 그래프의 공고 노드 → 스크랩 입력. 원래 위치(loc)는 진로 그래프에서 그 직무를 고르고 공고를 선택한 상태 */
export function postingScrapInput(n: ExNode, jobLabel?: string): ScrapInput | null {
  const o = n.posting;
  if (!o) return null;
  const meta: PostingMeta = {
    sub: [o.company, o.location, o.deadline ? `마감 ${o.deadline}` : ""].filter(Boolean).join(" · "),
    kind: "posting",
    company: o.company,
    title: o.title,
    location: o.location,
    deadline: o.deadline,
    url: n.url ?? null,
    source: o.source,
    jobId: n.parentId ?? null,
    jobLabel,
  };
  return {
    type: "job",
    ref_id: POSTING_PREFIX + n.id,
    title: o.title || o.company,
    meta: meta as unknown as Scrap["meta"],
    loc: { mode: "career", path: n.parentId ? [n.parentId] : [], sel: n.id },
  };
}

/** 마감일이 오늘보다 앞이면 true ("YYYY-MM-DD" 또는 "YYYY.MM.DD", 날짜가 아니면 false) */
export function isClosed(deadline: string | undefined, today = new Date()): boolean {
  const m = (deadline ?? "").match(/(\d{4})[-.](\d{1,2})[-.](\d{1,2})/);
  if (!m) return false;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59);
  return d.getTime() < today.getTime();
}
