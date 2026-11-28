import { PageSkeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return <PageSkeleton title="스크랩" layout="cards" message="자료를 불러오고 있어요." sub="스크랩한 학과·대학·공고를 불러오는 중이에요." />;
}
