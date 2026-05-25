import { ProfileTabLoadingSkeleton } from "@/components/loading/app-tab-skeletons";
import { TabCachedLoading } from "@/components/layout/tab-keep-alive";

export default function ProfileLoading() {
  return <TabCachedLoading tab="profile" fallback={<ProfileTabLoadingSkeleton />} />;
}
