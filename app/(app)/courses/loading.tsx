import { CoursesTabLoadingSkeleton } from "@/components/loading/app-tab-skeletons";
import { TabCachedLoading } from "@/components/layout/tab-keep-alive";

export default function CoursesLoading() {
  return <TabCachedLoading tab="courses" fallback={<CoursesTabLoadingSkeleton />} />;
}
