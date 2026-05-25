import { DiscoverTabLoadingSkeleton } from "@/components/loading/app-tab-skeletons";
import { TabCachedLoading } from "@/components/layout/tab-keep-alive";

export default function DiscoverLoading() {
  return <TabCachedLoading tab="discover" fallback={<DiscoverTabLoadingSkeleton />} />;
}
