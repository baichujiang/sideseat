/**
 * Two-character (or short) label to tell enrolled courses apart on the grid
 * without using category colors (those stay for calendar events).
 */
export function courseCalendarShortLabel(args: { courseCode: string | null; courseName: string }): string {
  const code = args.courseCode?.replace(/[^a-zA-Z0-9]/g, "").toUpperCase() ?? "";
  if (code.length >= 2) return code.slice(0, 2);
  if (code.length === 1) {
    const fromName = args.courseName.match(/[A-Za-z]/);
    const extra = fromName ? fromName[0]!.toUpperCase() : args.courseName.trim().charAt(0);
    return (code + (extra || "·")).slice(0, 2);
  }
  const name = args.courseName.trim();
  if (name.length >= 2) return name.slice(0, 2);
  return name.slice(0, 2) || "?";
}
