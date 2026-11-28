import { PageSkeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return <PageSkeleton title="연결 그래프" layout="graph" scene="graph" message="연결된 경험을 잇고 있어요" sub="프로젝트 기록과 학과·직무 정보를 불러오는 중이에요." />;
}
