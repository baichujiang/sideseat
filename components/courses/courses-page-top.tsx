import { CoursesEntryTabs } from "@/components/courses/courses-entry-tabs";
import { CoursesSchoolSelect } from "@/components/courses/courses-school-select";
import { getSchoolLabel, type SchoolCode } from "@/lib/constants/schools";
import type { CoursesTab } from "@/lib/courses/courses-tab";
import { formatMessage, type CoursesMessages } from "@/lib/i18n/messages";
import { cn } from "@/lib/utils";

export function CoursesPageTop({
  selectedSchool,
  allowedSchools,
  activeTab,
  query,
  courses,
}: {
  selectedSchool: SchoolCode;
  allowedSchools: SchoolCode[];
  activeTab: CoursesTab;
  query: string;
  courses: CoursesMessages;
}) {
  const schoolLabel = getSchoolLabel(selectedSchool);

  return (
    <div
      className={cn(
        "sticky top-0 z-20 -mx-3 space-y-3 border-b border-classmates-edge/45 bg-background/95 px-3 pb-3 pt-0",
        "backdrop-blur-md supports-[backdrop-filter]:bg-background/88",
        "dark:border-border/40 dark:bg-background/90 dark:supports-[backdrop-filter]:bg-background/85",
      )}
    >
      <header className="space-y-1.5">
        <div className="flex items-start justify-between gap-3">
          <h1
            className={cn(
              "min-w-0 text-[34px] font-bold leading-[1.05] tracking-[-0.02em] text-classmates-ink",
              "dark:text-foreground",
            )}
          >
            {courses.screenTitle}
          </h1>
          <div className="shrink-0 pt-1.5">
            <CoursesSchoolSelect
              value={selectedSchool}
              allowedSchools={allowedSchools.length > 0 ? allowedSchools : undefined}
              variant="toolbar"
              className="w-auto max-w-[7.5rem]"
            />
            <p className="sr-only">
              {formatMessage(courses.schoolSelectSrSuffix, { school: schoolLabel })}
            </p>
          </div>
        </div>
        <p className="max-w-[22rem] text-[15px] leading-snug text-classmates-sub dark:text-muted-foreground">
          {courses.screenSubtitle}
        </p>
      </header>

      <CoursesEntryTabs
        activeTab={activeTab}
        selectedSchool={selectedSchool}
        query={query}
        courses={courses}
      />
    </div>
  );
}
