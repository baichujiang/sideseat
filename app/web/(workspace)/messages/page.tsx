import { Suspense } from "react";
import { MessagesPage } from "@/components/web/messages";
import { Loading } from "@/components/web/ui";
export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <MessagesPage />
    </Suspense>
  );
}
