// ⚠ 시연 모드 전용 예시 데이터 — 중간 체크인 프로토타입(RC.mock)의 학과·대학·직무·채용공고를 그대로 옮겼다.
// 실제 추천 결과가 아니다. /graph?demo=1 에서만 쓰고, 화면에 "시연 모드 · 예시 데이터" 띠를 항상 보여 준다.
// 시연 모드에서는 스크랩·체크리스트를 저장하지 않는다 (예시 데이터를 학생 데이터로 남기지 않기 위해).

import { ROOTS, type ExNode, type ExploreData } from "@/lib/server/explore/explore";

type Raw = { id: string; label: string; sub: string; score: number; desc: string; tags: string[]; evidence: string[] };

const MAJORS: Raw[] = [
  { id: "geo-major", label: "지리학과", sub: "공간정보·지역 분석", score: 72, desc: "야간 귀가 안전지도의 지도·위치 표현, 현장 조사, 공간정보 분석 기록이 가장 강하게 연결돼요.", tags: ["공간정보 분석", "현장 조사", "지도 시각화"], evidence: ["야간 귀가 안전지도", "다회용컵 순환"] },
  { id: "cs-major", label: "컴퓨터공학과", sub: "소프트웨어·추천 알고리즘", score: 69, desc: "지역 활동 탐색의 문장 임베딩 실험과 팀원 매칭의 추천 로직 구현이 이어져요.", tags: ["Python", "추천 기준 설계", "소프트웨어 구현"], evidence: ["지역 활동 탐색", "팀원 매칭 플랫폼"] },
  { id: "urban-major", label: "도시계획학과", sub: "지역 문제·공공 서비스", score: 67, desc: "학교 주변 카페의 컵 순환과 청소년 귀가 안전처럼 지역 문제를 현장에서 조사하고 개선안을 만든 흐름이 보여요.", tags: ["지역 문제", "현장 조사", "서비스 기획"], evidence: ["다회용컵 순환", "야간 귀가 안전지도"] },
  { id: "design-major", label: "산업디자인학과", sub: "UX·서비스 디자인", score: 61, desc: "Figma 대여·반납 흐름 설계와 보행환경 비교 웹 화면처럼 사용자 조사를 화면·서비스로 옮긴 경험이 연결돼요.", tags: ["UX·화면 설계", "사용자 조사", "서비스 기획"], evidence: ["야간 귀가 안전지도", "다회용컵 순환"] },
  { id: "data-major", label: "데이터사이언스·통계학", sub: "정량 분석·시각화", score: 57, desc: "pandas 분석과 메뉴별 잔반량·만족도 시각화, 경험 데이터 구조화처럼 데이터를 다룬 기록이 이어져요.", tags: ["데이터 분석", "통계·표본 조사", "데이터 모델링"], evidence: ["급식 잔반 데이터", "팀원 매칭 플랫폼"] },
];
const JOBS: Raw[] = [
  { id: "ux-job", label: "UX·서비스 디자인", sub: "사용자 조사·화면 설계", score: 81, desc: "사용자 조사와 UX·화면 설계, 화면 시안까지 만든 경험이 가장 잘 맞아요.", tags: ["사용자 조사", "UX·화면 설계", "화면 시안"], evidence: ["야간 귀가 안전지도", "다회용컵 순환"] },
  { id: "env-job", label: "환경 서비스 기획", sub: "환경 문제·현장 조사", score: 80, desc: "다회용컵 순환과 급식 잔반처럼 환경 문제를 현장 조사와 데이터로 풀어 서비스로 기획한 경험이 연결돼요.", tags: ["환경 문제", "현장 조사", "서비스 기획"], evidence: ["다회용컵 순환", "급식 잔반 데이터"] },
  { id: "rec-job", label: "추천 서비스 기획", sub: "추천 기준 설계·사용자 조사", score: 77, desc: "임베딩 실험과 보완적 역량을 고려한 추천 기준처럼 추천 방식을 직접 설계한 경험이 강점이에요.", tags: ["추천 기준 설계", "서비스 기획", "사용자 조사"], evidence: ["지역 활동 탐색", "팀원 매칭 플랫폼"] },
  { id: "data-job", label: "데이터 분석", sub: "정량 분석·시각화", score: 75, desc: "Python 정량 분석과 통계·표본 조사, 데이터 시각화 기록이 이어져요.", tags: ["정량 분석", "통계·표본 조사", "데이터 시각화"], evidence: ["급식 잔반 데이터", "팀원 매칭 플랫폼"] },
  { id: "geo-job", label: "지도·공간정보 서비스", sub: "공간정보 분석·지도 표현", score: 70, desc: "위치 데이터를 수집·정제해 지도로 표현한 경험이 공간정보 서비스와 연결돼요.", tags: ["공간정보 분석", "지도·위치 표현", "현장 조사"], evidence: ["야간 귀가 안전지도", "급식 잔반 데이터"] },
];
const SCHOOLS: Record<string, Raw[]> = {
  "geo-major": [
    { id: "snu-geo", label: "서울대학교", sub: "지리학과", score: 84, desc: "공간정보 분석과 현장 조사 기록을 학업 계획과 연결해 볼 수 있어요.", tags: ["학생부", "면접", "탐구 기록"], evidence: ["야간 귀가 안전지도", "다회용컵 순환"] },
    { id: "khu-geo", label: "경희대학교", sub: "지리학과", score: 80, desc: "지역 조사와 지도 시각화 경험을 포트폴리오로 정리하면 좋아요.", tags: ["교과 성적", "활동 기록", "면접"], evidence: ["야간 귀가 안전지도"] },
    { id: "konkuk-geo", label: "건국대학교", sub: "지리학과", score: 76, desc: "야간 안전지도의 데이터 수집 기준과 시각화 과정을 설명해 보세요.", tags: ["학생부", "자기소개", "면접"], evidence: ["야간 귀가 안전지도"] },
  ],
  "cs-major": [
    { id: "dongguk-cs", label: "동국대학교", sub: "컴퓨터공학과", score: 82, desc: "임베딩 실험과 추천 로직 구현을 학생부 대체서식의 활동으로 정리할 수 있어요.", tags: ["학생부 대체서식", "증빙자료", "면접"], evidence: ["지역 활동 탐색", "팀원 매칭 플랫폼"] },
    { id: "uos-cs", label: "서울시립대학교", sub: "컴퓨터과학부", score: 79, desc: "Python 구현 경험과 데이터 모델링 과정을 탐구 기록으로 보여 주세요.", tags: ["교과 성적", "탐구 기록", "면접"], evidence: ["팀원 매칭 플랫폼"] },
    { id: "ssu-cs", label: "숭실대학교", sub: "컴퓨터학부", score: 75, desc: "추천 알고리즘 실험을 소프트웨어 프로젝트 경험으로 설명할 수 있어요.", tags: ["학생부", "활동 증빙", "면접"], evidence: ["지역 활동 탐색"] },
  ],
  "urban-major": [
    { id: "uos-urban", label: "서울시립대학교", sub: "도시공학과", score: 83, desc: "동네 상권과 귀가 동선 조사처럼 지역 문제를 현장에서 다룬 경험이 전공 관심을 보여 줘요.", tags: ["교과 성적", "학생부", "면접"], evidence: ["다회용컵 순환", "야간 귀가 안전지도"] },
    { id: "hongik-urban", label: "홍익대학교", sub: "도시공학과", score: 78, desc: "다회용컵 반납 서비스 기획과 안전지도 제작을 하나의 흐름으로 정리해 보세요.", tags: ["전형 확인", "활동 기록", "자기소개"], evidence: ["다회용컵 순환"] },
    { id: "hanyang-urban", label: "한양대학교", sub: "도시공학과", score: 74, desc: "위치 데이터 정리와 시각화 과정을 탐구 보고서로 보강하면 좋아요.", tags: ["교과 성적", "탐구 기록", "면접"], evidence: ["야간 귀가 안전지도"] },
  ],
  "design-major": [
    { id: "hongik-design", label: "홍익대학교", sub: "디자인학부", score: 77, desc: "Figma 대여·반납 흐름과 보행환경 비교 웹 화면을 포트폴리오 중심으로 구성할 수 있어요.", tags: ["포트폴리오", "학생부 확인", "면접"], evidence: ["야간 귀가 안전지도", "다회용컵 순환"] },
    { id: "kookmin-design", label: "국민대학교", sub: "공업디자인학과", score: 73, desc: "사용자 조사에서 화면 설계로 이어진 과정을 강조해 보세요.", tags: ["교과 성적", "활동 증빙", "포트폴리오"], evidence: ["야간 귀가 안전지도"] },
    { id: "seoultech-design", label: "서울과학기술대학교", sub: "디자인학과", score: 70, desc: "서비스 기획 결과물을 과정 중심 서사로 정리해 볼 수 있어요.", tags: ["전형 확인", "학생부", "면접"], evidence: ["다회용컵 순환"] },
  ],
  "data-major": [
    { id: "sejong-data", label: "세종대학교", sub: "데이터사이언스학과", score: 74, desc: "pandas 분석과 메뉴별 잔반량·만족도 시각화 과정을 탐구 보고서로 정리하면 좋아요.", tags: ["교과 성적", "탐구 보고서", "면접"], evidence: ["급식 잔반 데이터"] },
    { id: "kw-data", label: "광운대학교", sub: "정보융합학부", score: 71, desc: "데이터 모델링과 분석 리포트를 데이터 포트폴리오로 묶어 보세요.", tags: ["수학 성적", "데이터 포트폴리오", "면접"], evidence: ["급식 잔반 데이터", "팀원 매칭 플랫폼"] },
    { id: "sungshin-data", label: "성신여자대학교", sub: "AI융합학부", score: 68, desc: "추천 기준 설계와 분석 경험을 함께 보여 줄 수 있어요.", tags: ["학생부", "활동 기록", "면접"], evidence: ["팀원 매칭 플랫폼"] },
  ],
};
type RawPosting = { id: string; jobId: string; company: string; title: string; location: string; deadline: string; requirements: string[]; preferred: string[]; summary: string };
const POSTINGS: RawPosting[] = [
  { id: "pst-ux-1", jobId: "ux-job", company: "예시테크", title: "UX·서비스 디자이너 (주니어)", location: "서울 강남", deadline: "2026-12-15", requirements: ["사용자 인터뷰·설문 설계 경험", "와이어프레임·화면 시안 제작 경험(Figma)", "팀 프로젝트 1건 이상"], preferred: ["서비스 흐름 시각화 경험", "지역·공공 문제 프로젝트 경험"], summary: "모바일 서비스의 사용자 불편을 조사하고 화면 흐름과 시안으로 개선안을 만드는 역할이에요." },
  { id: "pst-ux-2", jobId: "ux-job", company: "샘플랩", title: "UX 리서치 인턴", location: "서울 성수", deadline: "2026-11-30", requirements: ["인터뷰 질문지·설문 문항 설계 경험", "조사 결과를 구조화한 경험"], preferred: ["인터뷰 결과 분류 경험", "Figma 활용"], summary: "리서치 팀과 함께 인터뷰를 설계하고 결과를 정리하는 3개월 인턴십이에요." },
  { id: "pst-ux-3", jobId: "ux-job", company: "가상모빌리티", title: "서비스 디자이너 (안전·이동)", location: "경기 판교", deadline: "2027-01-10", requirements: ["현장 조사 기록 정리 능력", "서비스 화면 설계 경험"], preferred: ["지도·위치 기반 서비스 설계 경험"], summary: "이동 서비스의 안전 기능을 현장 관찰로 정의하고 화면으로 설계해요." },
  { id: "pst-ux-4", jobId: "ux-job", company: "데모헬스", title: "UX 디자인 어시스턴트", location: "원격", deadline: "2026-12-01", requirements: ["인터뷰 기록·요약 경험", "꼼꼼한 문서 정리"], preferred: ["사용자 시나리오 작성 경험"], summary: "헬스케어 앱 사용자 인터뷰를 정리하고 시나리오·화면 초안을 만드는 역할이에요." },
  { id: "pst-env-1", jobId: "env-job", company: "예시그린", title: "환경 서비스 기획자 (주니어)", location: "서울 마포", deadline: "2026-12-20", requirements: ["환경·자원순환 프로젝트 경험", "현장 조사 → 기획안 도출 경험"], preferred: ["설문·인터뷰 설계 경험", "운영 비용 검토 경험"], summary: "다회용기·자원순환 서비스를 현장 조사에 근거해 기획하는 업무예요." },
  { id: "pst-env-2", jobId: "env-job", company: "샘플리필", title: "자원순환 프로그램 기획 인턴", location: "서울 송파", deadline: "2026-11-28", requirements: ["지역 상권·주민 조사 경험"], preferred: ["데이터 정리 경험", "프로토타입 제작 경험"], summary: "동네 상권의 다회용기 순환 프로그램을 설계하고 작은 실험을 운영하는 인턴십이에요." },
  { id: "pst-env-3", jobId: "env-job", company: "가상푸드랩", title: "급식·식품 폐기물 데이터 기획자", location: "대전", deadline: "2027-01-05", requirements: ["데이터 수집 설계 경험", "분석 결과를 개선안으로 연결한 경험"], preferred: ["Python 데이터 분석 경험"], summary: "급식·식품 폐기물 데이터를 모아 감축 개선안을 기획해요." },
  { id: "pst-rec-1", jobId: "rec-job", company: "예시러닝", title: "추천 서비스 기획자 (주니어)", location: "서울 강남", deadline: "2026-12-10", requirements: ["추천 기준·가중치 설계 경험", "사용자 조사 경험"], preferred: ["문장 임베딩·유사도 실험 경험", "Python 프로토타입 경험"], summary: "학습 콘텐츠 추천의 기준을 설계하고 사용자 조사로 검증하는 역할이에요." },
  { id: "pst-rec-2", jobId: "rec-job", company: "샘플매치", title: "매칭 알고리즘 기획 인턴", location: "원격", deadline: "2026-11-25", requirements: ["데이터 모델링 경험", "추천 결과를 검증한 경험"], preferred: ["역할·역량 기반 매칭 설계 경험"], summary: "팀·멘토 매칭 서비스의 추천 공식을 설계하고 더미 데이터로 검증하는 인턴십이에요." },
  { id: "pst-rec-3", jobId: "rec-job", company: "가상유스", title: "청소년 프로그램 탐색 서비스 PM", location: "서울 종로", deadline: "2027-01-20", requirements: ["정보 구조 설계 경험", "인터뷰·사용자 조사 경험"], preferred: ["정보 수집 자동화 경험"], summary: "흩어진 청소년 프로그램 정보를 모으고 추천하는 서비스를 운영해요." },
  { id: "pst-dt-1", jobId: "data-job", company: "예시데이터", title: "데이터 분석가 (주니어)", location: "서울 강남", deadline: "2026-12-18", requirements: ["Python(pandas) 데이터 정제 경험", "상관관계·패턴 분석 경험"], preferred: ["matplotlib·seaborn 시각화", "분석 리포트 작성 경험"], summary: "수집한 데이터를 정제·분석해 의사결정 리포트를 만드는 역할이에요." },
  { id: "pst-dt-2", jobId: "data-job", company: "샘플애널리틱스", title: "데이터 분석 인턴", location: "경기 성남", deadline: "2026-11-27", requirements: ["데이터 수집 설계 경험", "수집 항목 설계 경험"], preferred: ["통계적 한계를 보고서에 명시한 경험"], summary: "현장 데이터를 변수로 설계하고 시각화해 인사이트를 뽑는 인턴십이에요." },
  { id: "pst-dt-3", jobId: "data-job", company: "가상스쿨테크", title: "교육 데이터 기획자", location: "부산", deadline: "2027-01-08", requirements: ["학교·교육 현장 데이터 경험", "결과물 정리 능력"], preferred: ["영양·급식 등 생활 데이터 분석 경험"], summary: "학교 현장의 데이터를 모아 개선안으로 잇는 기획 업무예요." },
  { id: "pst-geo-1", jobId: "geo-job", company: "예시맵", title: "공간정보 서비스 기획자 (주니어)", location: "서울 구로", deadline: "2026-12-31", requirements: ["위치 데이터 수집·정제 경험", "지도 시각화 경험(Python 등)"], preferred: ["안전·공공 지도 프로젝트 경험", "Figma 화면 설계"], summary: "위치 데이터를 모아 지도 서비스의 기능과 범례를 설계하는 역할이에요." },
  { id: "pst-geo-2", jobId: "geo-job", company: "샘플세이프", title: "안전지도 데이터 인턴", location: "인천", deadline: "2026-12-05", requirements: ["야간·현장 조사 경험", "위치 데이터 구조화 경험"], preferred: ["조사 기준 가이드라인 작성 경험"], summary: "지역 안전 요소를 조사해 좌표 데이터로 구조화하고 지도에 올리는 인턴십이에요." },
  { id: "pst-geo-3", jobId: "geo-job", company: "가상도시데이터", title: "도시 데이터 시각화 담당", location: "세종", deadline: "2027-01-15", requirements: ["데이터 시각화 경험", "현장 조사 경험"], preferred: ["Python 시각화 경험"], summary: "도시 조사 데이터를 지도와 차트로 시각화해 보고서를 만들어요." },
];

/** 예시의 근거 이름("급식 잔반 데이터")을 내 프로젝트 id 로: 이름의 단어가 모두 제목에 들어 있으면 같은 프로젝트로 본다 */
function matcher(projects: { id: string; title: string }[]) {
  return (names: string[]) =>
    names.flatMap((name) => {
      const words = name.split(/\s+/);
      const hit = projects.find((p) => words.every((w) => p.title.includes(w)));
      return hit ? [hit.id] : [];
    });
}

export function buildDemoExplore(projects: { id: string; title: string }[]): ExploreData {
  const ev = matcher(projects);
  const all = projects.map((p) => p.id);
  const node = (r: Raw, kind: ExNode["kind"], extra: Partial<ExNode> = {}): ExNode =>
    ({ id: r.id, kind, label: r.label, sub: r.sub, desc: r.desc, score: r.score, tags: r.tags, evidence: ev(r.evidence), ...extra });
  const collegeNext: Record<string, ExNode[]> = {};
  for (const [majorId, list] of Object.entries(SCHOOLS)) collegeNext[majorId] = list.map((s) => node(s, "target", { parentId: majorId }));
  const careerNext: Record<string, ExNode[]> = {};
  for (const p of POSTINGS) {
    (careerNext[p.jobId] ??= []).push({
      id: p.id, kind: "posting", label: p.company, sub: p.title, evidence: [], parentId: p.jobId,
      posting: { company: p.company, title: p.title, location: p.location, deadline: p.deadline, requirements: p.requirements, preferred: p.preferred, summary: p.summary },
    });
  }
  return {
    demo: true,
    college: { root: { ...ROOTS.college, evidence: all }, children: MAJORS.map((m) => node(m, "recommend")), next: collegeNext, status: "ready", profileCount: MAJORS.length },
    career: { root: { ...ROOTS.career, evidence: all }, children: JOBS.map((j) => node(j, "recommend")), next: careerNext, status: "ready", profileCount: JOBS.length },
  };
}
