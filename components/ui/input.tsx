import * as React from "react";

import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          "flex h-11 w-full rounded-2xl border border-classmates-edge bg-background px-4 py-2 text-sm text-foreground shadow-sm outline-none transition placeholder:text-muted-foreground/80 focus-visible:border-classmates-azure focus-visible:ring-2 focus-visible:ring-classmates-azure/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 dark:border-border",
          className,
        )}
        {...props}
      />
    );
  },
);

Input.displayName = "Input";
