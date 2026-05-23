import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { APP_NAME } from "@/lib/constants/app";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-4 pb-[max(2rem,var(--safe-bottom))] pt-[max(2rem,var(--safe-top))] sm:px-5">
      <div className="mb-8 flex items-center justify-between">
        <Link
          aria-label="Back"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          href="/courses"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
        </Link>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
          {APP_NAME}
        </p>
        <span className="w-9" aria-hidden />
      </div>
      {children}
    </div>
  );
}
