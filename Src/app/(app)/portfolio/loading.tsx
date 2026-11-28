import { PageSkeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return <PageSkeleton title="포트폴리오 만들기" layout="steps" scene="portfolio" message="포트폴리오를 준비하고 있어요" sub="프로젝트 기록과 저장한 초안을 불러오는 중이에요." />;
}
