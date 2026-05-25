import { InboxTabLoadingSkeleton } from "@/components/loading/app-tab-skeletons";
import { TabCachedLoading } from "@/components/layout/tab-keep-alive";

export default function InboxLoading() {
  return <TabCachedLoading tab="inbox" fallback={<InboxTabLoadingSkeleton />} />;
}
