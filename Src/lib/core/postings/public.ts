// 공공기관 채용공고 (공공데이터포털 「재정경제부_공공기관 채용정보 조회서비스」 = 잡알리오) 를
// 추천 직무에 맞춰 고르고, 학생이 바로 쓸 수 있는 모양(배지·자격·전형·체크리스트)으로 바꾼다.
// 네트워크 없이 도는 순수 함수만 둔다. 호출·캐시는 lib/server/explore/publicPostings.ts (판단기록 D31)

/** API 한 건 (쓰는 칸만) */
export interface AlioRow {
  recrutPblntSn: number;
  instNm: string;
  recrutPbancTtl: string;
  srcUrl?: string | null;
  ncsCdLst?: string | null;
  hireTypeNmLst?: string | null;
  workRgnNmLst?: string | null;
  recrutSe?: string | null;
  recrutSeNm?: string | null;
  recrutNope?: number | null;
  pbancBgngYmd: string;
  pbancEndYmd: string;
  aplyQlfcCn?: string | null;
  prefCn?: string | null;
  prefCondCn?: string | null;
  scrnprcdrMthdExpln?: string | null;
  acbgCondLst?: string | null;
  acbgCondNmLst?: string | null;
  replmprYn?: string | null;
  ongoingYn?: string | null;
}

export interface PublicPosting {
  id: string;
  org: string;
  title: string;
  url: string;
  region: string;
  /** YYYY-MM-DD */
  start: string;
  end: string;
  hireType: string;
  /** 신입 / 경력 / 신입+경력 */
  career: string;
  /** "학력무관" · "고졸 가능" · "대졸 이상" 등 화면 배지 */
  badges: string[];
  /** 고졸·학력무관으로 지원할 수 있는지 (거캠 학생 기준) */
  openToHighSchool: boolean;
  requirements: string[];
  preferred: string[];
  stages: string[];
  checklist: string[];
  /** 직무명과 제목·자격이 얼마나 겹치는지 (0 이면 같은 분야일 뿐) */
  relevance: number;
}

/** 직무 이름 → NCS 대분류 코드 + 공고 제목에서 찾을 말. 위에서부터 처음 맞는 규칙 하나만 쓴다 */
const RULES: { re: RegExp; ncs: string[]; words: string[] }[] = [
  { re: /간호/, ncs: ["R600006"], words: ["간호"] },
  { re: /약사|한약/, ncs: ["R600006"], words: ["약사", "약제"] },
  { re: /영양/, ncs: ["R600006", "R600013"], words: ["영양"] },
  { re: /임상심리|심리|상담/, ncs: ["R600006", "R600007"], words: ["심리", "상담"] },
  { re: /의료정보/, ncs: ["R600020", "R600006"], words: ["의료정보", "전산", "정보화", "의무기록"] },
  { re: /하드웨어|전자|반도체/, ncs: ["R600019", "R600020"], words: ["전자", "하드웨어", "전기"] },
  { re: /정보보호|보안/, ncs: ["R600020"], words: ["보안", "정보보호", "관제"] },
  { re: /네트워크/, ncs: ["R600020"], words: ["네트워크", "통신", "전산", "정보보안"] },
  { re: /빅\s?데이터|데이터/, ncs: ["R600020"], words: ["데이터", "빅데이터", "분석"] },
  { re: /웹접근성/, ncs: ["R600020"], words: ["접근성", "웹", "디지털", "정보화"] },
  { re: /소프트웨어|개발자|앱|클라우드|사물\s?인터넷|가상현실|프로그래머|웹/, ncs: ["R600020"], words: ["전산", "개발", "소프트웨어", "SW", "IT", "AI", "정보화", "디지털", "데이터"] },
  { re: /UX|디자인/, ncs: ["R600008", "R600020"], words: ["디자인", "UX", "UI"] },
  { re: /크리에이터|콘텐츠|미디어|방송|영상/, ncs: ["R600008"], words: ["콘텐츠", "영상", "미디어", "홍보", "방송"] },
  { re: /기자|작가|편집/, ncs: ["R600008", "R600002"], words: ["홍보", "편집", "기자", "콘텐츠", "취재"] },
  { re: /학예|큐레이터|문화/, ncs: ["R600008", "R600004"], words: ["학예", "문화", "전시", "박물관"] },
  { re: /제과|제빵|조리|요리|바리스타/, ncs: ["R600013"], words: ["조리", "제과", "제빵"] },
  { re: /잡코치|사회복지|사회단체|복지/, ncs: ["R600007"], words: ["복지", "사회복지", "장애인", "직업재활"] },
  { re: /교사|교육|강사/, ncs: ["R600004"], words: ["교육", "교사", "강사"] },
  { re: /기후|환경|에너지/, ncs: ["R600023"], words: ["환경", "기후", "에너지", "탄소"] },
  { re: /도시|건축|토목/, ncs: ["R600014", "R600001"], words: ["도시재생", "도시계획", "도시", "건축"] },
  { re: /^행사|행사기획|이벤트|관광|여행/, ncs: ["R600012", "R600002"], words: ["행사", "관광", "기획"] },
  { re: /마케팅|홍보/, ncs: ["R600002"], words: ["마케팅", "홍보"] },
  { re: /경영|컨설턴트|회계|인사|사무/, ncs: ["R600002", "R600001"], words: ["경영", "기획", "행정"] },
  { re: /금융|보험|은행/, ncs: ["R600003"], words: ["금융", "보험"] },
  { re: /경찰|소방|법률|변호|교도/, ncs: ["R600005"], words: ["법무", "소방", "경찰"] },
  { re: /연구원|과학자|연구/, ncs: ["R600025"], words: ["연구"] },
];

export function jobNcs(jobName: string): { ncs: string[]; words: string[] } | null {
  const r = RULES.find((x) => x.re.test(jobName));
  return r ? { ncs: r.ncs, words: r.words } : null;
}

/** 손으로 쓴 규칙(검증됨) + 직업별 AI 생성 규칙(career_catalog.extra, 판단기록 D36)을 합친다. 손 규칙이 앞 */
export function mergeRule(hand: { ncs: string[]; words: string[] } | null, gen?: { ncs: string[]; words: string[] } | null): { ncs: string[]; words: string[] } | null {
  if (!hand && !gen?.ncs?.length) return null;
  return {
    ncs: [...new Set([...(hand?.ncs ?? []), ...(gen?.ncs ?? [])])],
    words: [...new Set([...(hand?.words ?? []), ...(gen?.words ?? [])])],
  };
}

/** 기관 이름은 빼고 본다 ("한국체육산업개발" 의 "개발", "건설기술교육원" 의 "교육", "영·섬유역협력단" 의 "협력" 이 직무로 잡히지 않게) */
export function bareTitle(r: Pick<AlioRow, "recrutPbancTtl" | "instNm">): string {
  return r.recrutPbancTtl.split(r.instNm).join(" ").replace(/\S*(개발원|개발공사|산업개발|교육원|정보원|진흥원|협력단|사업단|사업소|본부|지사|센터)\S*/g, " ");
}

const ymd = (s: string) => (/^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : s);
const lines = (s?: string | null) =>
  String(s ?? "")
    .split(/\r?\n|(?<=\S)\s*[○●■□▶※]\s*/)
    .map((l) => l.replace(/^[\s\-–·*○●■□▶※\d.)]+/, "").trim())
    .filter((l) => l.length >= 2);
const short = (s: string, n = 70) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

/** 학력 조건 → 배지. 학력무관·고졸은 거캠 학생에게 가장 중요한 정보라 맨 앞 */
function education(codes: string[]): { badges: string[]; open: boolean } {
  const open = codes.includes("R7010") || codes.includes("R7020") || codes.includes("R7030");
  const badges: string[] = [];
  if (codes.includes("R7010")) badges.push("학력무관");
  else if (codes.includes("R7030") || codes.includes("R7020")) badges.push("고졸 가능");
  else if (codes.includes("R7040")) badges.push("전문대졸 이상");
  else if (codes.includes("R7050")) badges.push("대졸 이상");
  else if (codes.some((c) => c === "R7060" || c === "R7070")) badges.push("석·박사");
  return { badges, open };
}

/** 우대사항은 법 조항 문장이 길어 표지만 뽑는다 */
const PREF_RULES: [RegExp, string][] = [
  [/취업지원대상|보훈|국가유공|독립유공|5\.?18|특수임무/, "보훈·취업지원대상자"],
  [/장애/, "장애인"],
  [/지역인재|지역\s*주민|이전지역/, "지역인재·지역주민"],
  [/저소득|기초생활|한부모|취약계층/, "취업취약계층"],
  [/고졸|고등학교\s*졸업/, "고졸자"],
  [/자격증|면허|기사/, "관련 자격증"],
  [/경력|경험/, "관련 경력·경험"],
  [/봉사/, "봉사활동 실적"],
  [/북한이탈|다문화/, "북한이탈주민·다문화"],
];
function preferredOf(text: string): string[] {
  const tags = PREF_RULES.filter(([re]) => re.test(text)).map(([, t]) => t);
  if (tags.length) return tags;
  return lines(text).slice(0, 2).map((l) => short(l, 40));
}

const STAGE_RULES: [RegExp, string, string][] = [
  [/서류/, "서류전형", "자기소개서·지원서 작성"],
  [/필기|NCS|직업기초|전공시험/, "필기시험", "필기시험(NCS 직업기초능력) 준비"],
  [/인성/, "인성검사", "인성검사 응시"],
  [/실기|실무평가|시연/, "실기", "실기·실무평가 준비"],
  [/면접/, "면접", "면접 예상 질문 정리"],
  [/신원|채용신체|건강검진/, "신원·건강 확인", "채용 신체검사·서류 준비"],
];

/** 제목에 직무 말이 있나. strict 인 말(AI 가 만든 2글자)은 낱말 첫머리일 때만 ("단기전임직"의 "기전", "인증처" 앞 "기계인증" ✗, "_우편물" ✓) */
export function titleHas(title: string, w: string, strict = false): boolean {
  if (!strict) return title.includes(w);
  return new RegExp(`(^|[^가-힣])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(title);
}

export function toPublicPosting(r: AlioRow, words: string[] = [], strict: Set<string> = new Set()): PublicPosting {
  const acbg = String(r.acbgCondLst ?? "").split(",").filter(Boolean);
  const { badges, open } = education(acbg);
  if (r.recrutSe === "R2010") badges.push("신입");
  if (r.replmprYn === "Y") badges.push("대체인력");
  const procedure = String(r.scrnprcdrMthdExpln ?? "");
  const stages = STAGE_RULES.filter(([re]) => re.test(procedure)).map(([, name]) => name);
  const qual = String(r.aplyQlfcCn ?? "");
  const pref = String(r.prefCn ?? r.prefCondCn ?? "");
  const checklist = [
    "공고문·첨부 양식 내려받기",
    ...STAGE_RULES.filter(([re]) => re.test(procedure)).map(([, , todo]) => todo),
    ...(/자격증|면허|자격\s*소지|기사|산업기사/.test(qual) ? ["필요 자격증·면허 확인"] : []),
    ...(/토익|TOEIC|어학|오픽|OPIc/i.test(qual) ? ["어학 성적 확인"] : []),
    ...(/취업지원대상|장애|저소득|지역인재|고졸/.test(pref) ? ["우대(가점) 해당 여부 확인"] : []),
    `지원서 제출 (마감 ${ymd(r.pbancEndYmd).slice(5).replace("-", "/")})`,
  ];
  // 제목에 직무 말이 나와야 "직무 일치". 자격 본문은 넓은 말("정보" 등)이 너무 자주 나와 쓰지 않는다
  const bare = bareTitle(r);
  // 미화·경비·당직 같은 시설 업무가 함께 걸린 공고 제목은 직무 말이 있어도 세지 않는다 ("환경미화원" ≠ 환경 직무)
  const noise = /미화|청소|경비원|시설관리원|취사원|노무원/.test(bare) && !words.some((w) => /조리|급식/.test(w));
  const relevance = noise ? 0 : words.filter((w) => titleHas(bare, w, strict.has(w))).length;
  return {
    id: String(r.recrutPblntSn),
    org: r.instNm,
    title: r.recrutPbancTtl,
    url: r.srcUrl && /^https?:\/\//.test(r.srcUrl) ? r.srcUrl : `https://job.alio.go.kr/recruitview.do?idx=${r.recrutPblntSn}`,
    region: String(r.workRgnNmLst ?? "").split(",").slice(0, 2).join("·") || "지역 확인",
    start: ymd(r.pbancBgngYmd),
    end: ymd(r.pbancEndYmd),
    hireType: String(r.hireTypeNmLst ?? "").split(",")[0] ?? "",
    career: r.recrutSeNm ?? "",
    badges,
    openToHighSchool: open,
    requirements: lines(qual).slice(0, 4).map((l) => short(l)),
    preferred: preferredOf(pref),
    stages,
    checklist: [...new Set(checklist)],
    relevance,
  };
}

/**
 * 진행 중 공고 → 이 직무에 보여 줄 공고 (최신순, 사용자 요청 D31).
 *   1) 직무 이름 규칙으로 NCS 분야가 겹치는 공고만
 *   2) 경력 전용·외국인·석박사 전용은 뺀다 (학생이 지원할 수 없는 공고)
 *   3) 제목(기관 이름 뺀)에 직무 말이 나오는 공고만
 *   4) 시작일 최신순 (같은 날이면 공고 번호 큰 것 = 나중에 올라온 것)
 */
export function pickForJob(rows: AlioRow[], jobName: string, limit = 6, today = new Date(), extra?: { ncs: string[]; words: string[] } | null): { items: PublicPosting[]; total: number; ncs: string[] } {
  const hand = jobNcs(jobName);
  const rule = mergeRule(hand, extra);
  if (!rule) return { items: [], total: 0, ncs: [] };
  // AI 가 만든 단어 중 너무 흔한 말(전체 진행 중 공고 제목의 2% 넘게 나오는 "정비·안전·협력" 등)은 세지 않는다. 손 규칙 단어는 검증됐으므로 그대로 (판단기록 D36)
  const titles = rows.map(bareTitle);
  const cap = Math.max(8, Math.round(rows.length * 0.02));
  const handWords = new Set(hand?.words ?? []);
  //   2글자 말(정비·재활·예방·상담)은 넓은 경우가 많아 3건 이하로 드물 때만 ("사서·비서·우편"은 살아남는다)
  const words = rule.words.filter((w) => {
    if (handWords.has(w)) return true;
    const df = titles.filter((t) => t.includes(w)).length;
    return df <= (w.length <= 2 ? 3 : cap);
  });
  const now = today.toISOString().slice(0, 10).replaceAll("-", "");
  const usable = rows.filter((r) => {
    if (r.ongoingYn && r.ongoingYn !== "Y") return false;
    if (r.pbancEndYmd && r.pbancEndYmd < now) return false;
    if (r.pbancBgngYmd && r.pbancBgngYmd > now) return false; // 아직 접수 전 (인턴 선발 공고 등)
    if (r.recrutSe === "R2020" || r.recrutSe === "R2040") return false;
    const acbg = String(r.acbgCondLst ?? "").split(",").filter(Boolean);
    if (acbg.length && acbg.every((c) => c === "R7060" || c === "R7070")) return false;
    const ncs = String(r.ncsCdLst ?? "").split(",");
    return rule.ncs.some((c) => ncs.includes(c));
  });
  const strict = new Set(words.filter((w) => !handWords.has(w) && w.length <= 2));
  const all = usable.map((r) => toPublicPosting(r, words, strict));
  // 제목에 직무 말이 있는 공고만. "같은 분야"로 넓히면 상수도 운영직이 정보보호 직무에 붙는 식이라 오히려 신뢰를 잃는다 (판단기록 D31)
  const pool = all.filter((p) => p.relevance > 0);
  pool.sort((a, b) => b.start.localeCompare(a.start) || Number(b.id) - Number(a.id));
  return { items: pool.slice(0, limit), total: pool.length, ncs: rule.ncs };
}
