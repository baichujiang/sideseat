import { PlanDetailPage } from "@/components/web/plans";
export default async function Page({
  params,
}: {
  params: Promise<{
    token: string;
  }>;
}) {
  return <PlanDetailPage token={(await params).token} />;
}
