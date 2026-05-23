import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import type { VariantProps } from "class-variance-authority";

import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";

type NextLinkHref = ComponentProps<typeof Link>["href"];

type Props = {
  /** Supports dynamic paths; satisfies Next `typedRoutes` at the call site via internal assertion. */
  href: NextLinkHref | string;
  className?: string;
  children: ReactNode;
  onClick?: ComponentProps<typeof Link>["onClick"];
} & VariantProps<typeof buttonVariants>;

/**
 * Renders a Next.js Link styled as a Button (valid `<a>`, no nested `<button>`).
 */
export function LinkButton({ href, className, variant, size, children, onClick }: Props) {
  return (
    <Link
      href={href as NextLinkHref}
      className={cn(buttonVariants({ variant, size }), className)}
      onClick={onClick}
    >
      {children}
    </Link>
  );
}
