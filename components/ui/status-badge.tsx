import { cn } from "@/lib/utils";

const toneMap = {
  neutral: "bg-secondary text-secondary-foreground",
  calm: "bg-[#dff2ee] text-[#16504a]",
  warm: "bg-[#faecd8] text-[#7a4f1c]",
  danger: "bg-[#fde1df] text-[#8a2b22]",
};

export function StatusBadge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: keyof typeof toneMap;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold tracking-[0.02em]",
        toneMap[tone],
      )}
    >
      {children}
    </span>
  );
}
