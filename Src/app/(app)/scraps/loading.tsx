import { PageSkeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return <PageSkeleton title="스크랩" layout="cards" scene="scraps" message="스크랩을 불러오고 있어요" sub="모아 둔 학과·대학·공고를 가져오는 중이에요." />;
}
