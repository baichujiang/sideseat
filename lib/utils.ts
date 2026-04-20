import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatSemester(semester?: number | null) {
  if (!semester) {
    return "Semester not set";
  }

  const suffix =
    semester % 10 === 1 && semester !== 11
      ? "st"
      : semester % 10 === 2 && semester !== 12
        ? "nd"
        : semester % 10 === 3 && semester !== 13
          ? "rd"
          : "th";

  return `${semester}${suffix} semester`;
}

export function formatInvitationType(type: string) {
  return type
    .toLowerCase()
    .split("_")
    .join(" ")
    .replace(/^\w/, (char) => char.toUpperCase());
}
