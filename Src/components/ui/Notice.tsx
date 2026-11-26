import { Icon } from "./Icon";

// 프로토타입 RC.ui.notice — 경고 배너 문구
export const NOTICE = {
  ai: "AI 기반 추천일 뿐이며, 실제 결정 전 반드시 직접 확인하세요.",
  form: "대체서식은 참고용입니다. 제출 전 해당 대학의 공식 서식·유의사항을 직접 확인하세요.",
  job: "채용공고 정보는 변경·마감될 수 있습니다. 지원 전 원문 공고를 직접 확인하세요.",
  school: "학교 정보는 최신 모집요강을 직접 확인하세요.",
  mock: "예시 데이터입니다. 실제 정보가 아니에요.",
  score: "점수표와 내 기록의 태그가 겹치는 정도로 계산한 값이에요. 합격·취업 가능성이 아니에요.",
  noai: "AI 초안 생성은 아직 연결되지 않았어요. 내 기록을 보며 직접 작성해요.",
} as const;

export type NoticeType = keyof typeof NOTICE;

export function Notice({ type, extra, className }: { type: NoticeType; extra?: string; className?: string }) {
  return (
    <div className={`notice notice-${type}${className ? " " + className : ""}`} role="note">
      <Icon name="info" />
      <span>{NOTICE[type]}{extra ? " " + extra : ""}</span>
    </div>
  );
}
