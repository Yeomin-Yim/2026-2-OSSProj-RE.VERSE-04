// 진로 탐색 그래프의 채용공고: 추천 직무 이름으로 사람인 채용공고를 찾아 링크로 보여 준다.
// 사람인 Open API (https://oapi.saramin.co.kr/guide/job-search). 키: SARAMIN_ACCESS_KEY (없으면 빈 목록 → 화면은 "준비 중")
// 하루 호출 수 제한이 있어 키워드별로 6시간 서버 메모리에 담아 둔다. 실패해도 그래프는 그대로 보여 준다.

import type { ExNode } from "./explore";

const API = "https://oapi.saramin.co.kr/job-search";
const TTL_MS = 6 * 3600 * 1000;
const PER_JOB = 5;
const cache = new Map<string, { at: number; items: Posting[] }>();

export interface Posting {
  id: string;
  url: string;
  company: string;
  title: string;
  location: string;
  deadline: string;
  experience: string;
  education: string;
  jobType: string;
  keywords: string;
}

/** 커리어넷 직업 이름 → 채용공고 검색어. 공고에 잘 쓰이는 말로 줄인다 */
const OVERRIDE: Record<string, string> = {
  "인문계중등학교교사": "중등 교사",
  "개인미디어 콘텐츠제작자(크리에이터)": "콘텐츠 크리에이터",
  "학예사(큐레이터)": "학예사",
  "컴퓨터하드웨어 기술자 및 연구원": "하드웨어 개발",
  "약사 및 한약사": "약사",
  "제과사 및 제빵사": "제과제빵",
  "빅 데이터 전문가": "빅데이터 분석",
  "사물 인터넷 전문가": "IoT",
  "기후변화 대응 전문가": "기후변화",
};
export function postingKeyword(jobName: string): string {
  if (OVERRIDE[jobName]) return OVERRIDE[jobName];
  return jobName
    .replace(/\([^)]*\)/g, "")
    .replace(/\s*및\s.*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

const unescape = (s: unknown) =>
  String(s ?? "").replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/<[^>]+>/g, "").trim();

function deadlineOf(j: Record<string, any>): string {
  const ts = Number(j["expiration-timestamp"]);
  const close = unescape(j["close-type"]?.name);
  if (close && /상시|채용시/.test(close)) return close;
  if (ts > 0) return new Date(ts * 1000 + 9 * 3600e3).toISOString().slice(0, 10);
  return close || "확인 필요";
}

/** 사람인 응답 한 건 → Posting (응답 모양이 바뀌어도 빈 칸으로 버틴다) */
export function toPosting(j: Record<string, any>): Posting | null {
  const url = typeof j.url === "string" && j.url.startsWith("https://") ? j.url : null;
  const title = unescape(j.position?.title);
  if (!url || !title) return null;
  return {
    id: String(j.id ?? url),
    url,
    company: unescape(j.company?.detail?.name) || "기업명 확인 필요",
    title,
    location: unescape(j.position?.location?.name).split(",")[0] || "지역 확인 필요",
    deadline: deadlineOf(j),
    experience: unescape(j.position?.["experience-level"]?.name),
    education: unescape(j.position?.["required-education-level"]?.name),
    jobType: unescape(j.position?.["job-type"]?.name),
    keywords: unescape(j.keyword),
  };
}

export async function searchPostings(keyword: string, key = process.env.SARAMIN_ACCESS_KEY): Promise<Posting[]> {
  if (!key || !keyword) return [];
  const hit = cache.get(keyword);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.items;

  const params = new URLSearchParams({ keywords: keyword, count: String(PER_JOB), sort: "pd", sr: "directhire" });
  try {
    // 키는 사람인 규격상 주소에 넣는다 (서버에서만 호출, 브라우저로 가지 않음)
    const res = await fetch(`${API}?access-key=${encodeURIComponent(key)}&${params}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    const body = await res.json();
    if (!res.ok || body.code) throw new Error(`사람인 오류 ${body.code ?? res.status}: ${body.message ?? ""}`);
    const items = ((body.jobs?.job ?? []) as Record<string, any>[]).map(toPosting).filter((p): p is Posting => !!p);
    cache.set(keyword, { at: Date.now(), items });
    return items;
  } catch (e) {
    console.warn("채용공고를 가져오지 못했어요:", keyword, e instanceof Error ? e.message : e);
    return [];
  }
}

/** 추천 직무 노드 아래 붙일 채용공고 노드 */
export function postingNodes(job: ExNode, items: Posting[]): ExNode[] {
  return items.map((p) => ({
    id: `p:${job.id}:${p.id}`,
    kind: "posting",
    label: p.company,
    sub: p.title,
    desc: `${p.location} · 마감 ${p.deadline}`,
    evidence: [],
    parentId: job.id,
    url: p.url,
    posting: {
      company: p.company,
      title: p.title,
      location: p.location,
      deadline: p.deadline,
      requirements: [p.experience, p.education].filter(Boolean),
      preferred: [],
      summary: [p.jobType, p.keywords].filter(Boolean).join(" · ") || "자세한 내용은 사람인 원문에서 확인하세요.",
    },
  }));
}
