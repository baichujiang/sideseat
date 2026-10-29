import { Suspense } from "react";
import { PlansPage } from "@/components/web/plans";
import { Loading } from "@/components/web/ui";
export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <PlansPage />
    </Suspense>
  );
}
