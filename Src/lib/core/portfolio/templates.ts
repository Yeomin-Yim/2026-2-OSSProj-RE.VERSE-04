// 포트폴리오 서식(템플릿) 정의 — 프로토타입 RC.templates 를 그대로 옮겼다.
// 새 레퍼런스(서식)가 생기면 TEMPLATES 에 항목만 추가한다.

export type TemplateId = "portfolio-project" | "altform-dongguk-2027" | "portfolio-profile";

export interface TemplateSection {
  key: string;
  label: string;
  guide?: string;
  limit?: number;
  manual?: boolean;
  ph?: string;
  prompt: string;
  sourceFields: string[];
}

export interface Template {
  id: TemplateId;
  name: string;
  type: "portfolio" | "altform" | "profile";
  notice: "ai" | "form";
  hidden?: boolean;
  ref: string;
  desc?: string;
  bullets?: [string, string][];
  minRows?: number;
  maxRows?: number;
  contentLimit?: number;
  columns?: { key: AltKey; label: string; ph: string; area?: boolean }[];
  rules?: string[];
  checklist?: string[];
  sections: TemplateSection[];
}

export type AltKey = "name" | "period" | "content" | "org" | "page";

export const TEMPLATES: Record<TemplateId, Template> = {
  "portfolio-project": {
    id: "portfolio-project",
    name: "프로젝트 포트폴리오",
    type: "portfolio",
    notice: "ai",
    ref: "Doc/ref/resume_download_4106.pdf · 사람인 이력서 템플릿 (디자인·프로필·자기소개서) + 프로젝트별 3섹션",
    desc: "사람인 템플릿 디자인으로 프로필·프로젝트·자기소개서를 한 문서에 담아요.",
    bullets: [
      ["1쪽 · 프로필 · 학력 · 스킬", "왼쪽 프로필, 오른쪽 학력·스킬·주요 프로젝트 (사람인 1쪽 구조)"],
      ["프로젝트별 한 쪽", "문제 → 내 역할과 과정 → 결과와 회고"],
      ["마지막 쪽 · 자기소개서", "슬로건 + 지원동기 + 앞으로의 포부 (사람인 2쪽 구조)"],
    ],
    sections: [
      {
        key: "problem", label: "문제", limit: 1000,
        guide: "프로젝트를 시작하게 된 배경과 해결하고자 했던 문제를 작성해보세요.",
        prompt: "고등학생의 프로젝트 기록을 바탕으로, 프로젝트를 시작한 배경과 해결하려던 문제를 1인칭 경어체 4~6문장으로 쓴다. 회의록·메모에 적힌 계기와 생각의 변화를 포함한다. 기록에 없는 사실은 지어내지 않는다.",
        sourceFields: ["title", "topic", "overview.problem", "records[].text"],
      },
      {
        key: "role", label: "내 역할과 과정", limit: 1000,
        guide: "프로젝트에서 내가 맡은 역할과 진행 과정을 구체적으로 작성해보세요.",
        prompt: "내가 맡은 역할과 진행 과정을 시간 순서로, 1인칭 경어체 5~8문장으로 쓴다. 회의 차수·수치·도구처럼 기록에 있는 구체적 사실을 살리고, 팀 전체가 아니라 \"내가 한 일\"이 드러나게 한다.",
        sourceFields: ["overview.role", "overview.activity", "overview.process", "records[].text"],
      },
      {
        key: "result", label: "결과와 회고", limit: 1000,
        guide: "프로젝트의 결과와 배운 점, 앞으로의 적용점을 작성해보세요.",
        prompt: "결과물과 달라진 점, 배운 점, 다음에 적용할 점을 1인칭 경어체 4~6문장으로 쓴다. 회고 메모의 한계·아쉬움도 솔직하게 담고, 과장하지 않는다.",
        sourceFields: ["overview.result", "overview.reflection", "records[].text"],
      },
    ],
  },
  "altform-dongguk-2027": {
    id: "altform-dongguk-2027",
    name: "학교생활기록부 대체서식",
    type: "altform",
    notice: "form",
    minRows: 5,
    maxRows: 10,
    contentLimit: 100,
    ref: "Doc/ref/4_1. 학생부종합전형_학교생활기록부 대체 서식.pdf · 동국대학교 2027학년도 수시모집",
    desc: "동국대 2027 수시 「증빙자료 목록표」 틀을 그대로 따라요.",
    bullets: [
      ["① 활동명 · ② 활동기간", "유사한 활동은 하나로 묶고 고교 기간의 활동만 적어요."],
      ["③ 활동내용 100자 · ④ 활동(발행)기관", "기관명은 활동내용에 쓰지 않고, 객관적 사실만 적어요."],
      ["⑤ 해당 페이지 · 증빙 10매", "증빙자료 순서와 연번을 맞추고 페이지를 적어요."],
    ],
    columns: [
      { key: "name", label: "① 활동명", ph: "예: 다회용컵 순환 프로젝트" },
      { key: "period", label: "② 활동기간", ph: "2026.03.02 ~ 2026.05.29" },
      { key: "content", label: "③ 활동내용 (100자 이내)", ph: "기록에 근거한 객관적 사실만 (기관명 제외)", area: true },
      { key: "org", label: "④ 활동(발행)기관", ph: "직접 확인" },
      { key: "page", label: "⑤ 해당 페이지", ph: "예: 1-2" },
    ],
    rules: [
      "활동내용은 100자 이내, 활동(발행)기관명은 쓰지 않고 객관적 사실만 서술합니다.",
      "유사한 성격의 활동은 1개의 활동명으로 묶고, 고등학교 기간의 활동만 적습니다.",
      "공인어학성적, 교외 수상실적, 자격증, 특정 대학·기관명, 부모의 사회·경제적 지위를 암시하는 내용은 기재 금지입니다.",
      "증빙자료는 A4 단면 10매 이내로, 목록표의 연번 순서와 일치시키고 해당 페이지를 적습니다.",
      "본 서식은 참고용이며 원서접수 시 온라인 입력 후 출력하여 제출합니다.",
    ],
    checklist: [
      "작성 유의사항(기재 금지 항목) 확인",
      "학교·기관에 증빙자료 발급 요청",
      "증빙자료 10매 이내로 정리하고 페이지 번호 기재",
      "원서접수 시 온라인 입력 후 출력",
    ],
    sections: [
      {
        key: "rows", label: "증빙자료 목록표", limit: 100,
        prompt: "프로젝트 하나를 목록표 한 행으로 바꾼다. 활동명은 짧은 명사구, 활동기간은 YYYY.MM.DD ~ YYYY.MM.DD, 활동내용은 기관명 없이 객관적 사실만 100자 이내의 개조식(\"~함.\")으로 쓴다. 활동(발행)기관과 해당 페이지는 비워 두고 사용자가 직접 확인하게 한다.",
        sourceFields: ["title", "dates", "overview.process", "overview.result"],
      },
    ],
  },
  // 포트폴리오 1쪽(프로필)·마지막 쪽(자기소개서). 사람인 이력서 템플릿을 포트폴리오에 병합한 것이라 목록에는 숨긴다.
  "portfolio-profile": {
    id: "portfolio-profile",
    name: "포트폴리오 프로필 · 자기소개",
    type: "profile",
    notice: "ai",
    hidden: true,
    ref: "Doc/ref/resume_download_4106.pdf · 사람인 이력서 템플릿",
    sections: [
      { key: "slogan", label: "한 줄 소개", limit: 40, prompt: "포트폴리오 첫 쪽 인사말(\"안녕하세요 / ○○ / 이름입니다\")의 ○○ 자리에 들어갈 명사구를 짧게 쓴다. 기록의 패턴(관찰 → 문제 정리 → 개선안)이 드러나게 한다.", sourceFields: ["tags"] },
      { key: "education", label: "학력", manual: true, ph: "예: OO고등학교 재학 (2024.03 ~ )", prompt: "", sourceFields: [] },
      { key: "link", label: "포트폴리오 · SNS 링크", manual: true, ph: "예: https://…", prompt: "", sourceFields: [] },
      { key: "skills", label: "스킬 · 관심 키워드", limit: 120, prompt: "기록에서 찾은 태그를 많이 나온 순서로 중복 없이 쉼표로 나열한다(최대 6개). 도구나 자격은 기록에 없으면 적지 않는다.", sourceFields: ["tags"] },
      { key: "motivation", label: "자기소개서 · 지원동기", limit: 500, prompt: "프로젝트에서 발견한 문제와 관심 분야를 근거로 이 학교·직무에 지원하는 이유를 1인칭 경어체 3~4문장으로 쓴다.", sourceFields: ["overview.problem", "tags"] },
      { key: "aspiration", label: "자기소개서 · 앞으로의 포부", limit: 500, prompt: "기록의 회고와 패턴을 근거로 앞으로 해 보고 싶은 일을 1인칭 경어체 2~3문장으로 쓴다. 과장하지 않는다.", sourceFields: ["overview.reflection"] },
      { key: "awards", label: "수상 · 자격증 (직접 입력)", manual: true, ph: "기록에 없는 항목은 비워 두세요.", prompt: "", sourceFields: [] },
    ],
  },
};

export const templateList = () => Object.values(TEMPLATES).filter((t) => !t.hidden);
export const isTemplateId = (id: string): id is TemplateId => id in TEMPLATES;
