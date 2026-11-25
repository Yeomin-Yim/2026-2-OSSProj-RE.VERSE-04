// 진로 탐색의 "준비 정보" 선택지와 기본 체크리스트.
// 특정 학교·회사의 정보가 아니라 어느 학생에게나 같은 준비 단계 안내라서 실제 모드에서도 쓴다.
import type { ExNode } from "@/lib/server/explore/explore";

const info = (id: string, label: string, sub: string, desc: string, extra: Partial<ExNode> = {}): ExNode =>
  ({ id, kind: "info", label, sub, desc, evidence: [], ...extra });

export const INFO_LEAVES: Record<"college" | "career", ExNode[]> = {
  college: [
    info("doc-guide", "모집요강 확인", "지원 기준·일정", "학교별 모집요강에서 전형 방법, 제출 서류, 일정을 직접 확인해요. 아래 체크리스트로 관리할 수 있어요.", { action: "todo" }),
    info("doc-portfolio", "포트폴리오", "과정 중심 구성", "내 프로젝트를 문제 → 역할·과정 → 결과·회고 흐름으로 정리한 포트폴리오를 만들어요.", { tpl: "portfolio-project" }),
    info("doc-altform", "대체서식", "학생부 대체 서류", "학교생활기록부 대체서식(증빙자료 목록표)을 프로젝트 기록으로 채워요.", { tpl: "altform-dongguk-2027" }),
    info("doc-interview", "면접·전형 정보", "학교별 일정", "면접 여부와 일정은 학교마다 달라요. 모집요강에서 확인하고 준비 일정을 체크리스트에 적어 두세요.", { action: "todo" }),
  ],
  career: [
    info("job-portfolio", "직무 포트폴리오", "프로필 + 프로젝트 + 자기소개", "이력서 항목(프로필·학력·스킬·자기소개서)이 포함된 포트폴리오를 만들어요.", { tpl: "portfolio-project" }),
    info("job-guide", "직무 기술서 확인", "요건·우대 사항", "채용공고의 자격 요건과 우대 사항을 내 프로젝트와 비교해 보고, 준비할 일을 체크리스트에 적어요.", { action: "todo" }),
  ],
};

export const CHECKLIST = {
  university: ["모집요강 확인", "제출 서류 준비", "마감일 캘린더 등록"],
  major: ["학과 교육과정 살펴보기", "관련 프로젝트 정리", "개설 대학 비교"],
  job: ["직무 기술서 확인", "관련 프로젝트 정리", "포트폴리오 링크 준비"],
  posting: ["공고 원문 확인", "포트폴리오 링크 준비", "지원서 제출"],
};
