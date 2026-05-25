import { HomeTabLoadingSkeleton } from "@/components/loading/app-tab-skeletons";
import { TabCachedLoading } from "@/components/layout/tab-keep-alive";

export default function HomeLoading() {
  return <TabCachedLoading tab="home" fallback={<HomeTabLoadingSkeleton />} />;
}
