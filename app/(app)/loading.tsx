import { AppTabLoadingFallback } from "@/components/loading/app-tab-skeletons";

/** Fallback while `(app)` child segments without their own `loading.tsx` resolve. */
export default function AppLoading() {
  return <AppTabLoadingFallback />;
}
