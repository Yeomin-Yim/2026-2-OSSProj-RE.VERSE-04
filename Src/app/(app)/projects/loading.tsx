import { PageSkeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return <PageSkeleton title="프로젝트 관리" layout="projects" scene="projects" message="프로젝트 기록을 모으고 있어요" sub="내 프로젝트와 자료를 정리해서 보여 드릴게요." />;
}
