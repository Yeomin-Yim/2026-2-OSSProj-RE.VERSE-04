import { PageSkeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return <PageSkeleton title="프로젝트 관리" layout="projects" message="프로젝트 기록을 확인하고 있어요." sub="내 프로젝트와 자료 목록을 불러오는 중이에요." />;
}
