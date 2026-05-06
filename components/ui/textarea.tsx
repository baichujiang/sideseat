import * as React from "react";

import { cn } from "@/lib/utils";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => {
  return (
    <textarea
      ref={ref}
        className={cn(
          "min-h-28 w-full resize-y rounded-2xl border border-classmates-edge bg-background px-4 py-3 text-sm text-foreground shadow-sm outline-none transition placeholder:text-muted-foreground/80 focus-visible:border-classmates-azure focus-visible:ring-2 focus-visible:ring-classmates-azure/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 dark:border-border",
          className,
        )}
      {...props}
    />
  );
});

Textarea.displayName = "Textarea";
