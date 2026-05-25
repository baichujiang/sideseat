import { CoursesEntryTabs } from "@/components/courses/courses-entry-tabs";
import { CoursesSchoolSelect } from "@/components/courses/courses-school-select";
import { getSchoolLabel, type SchoolCode } from "@/lib/constants/schools";
import type { CoursesTab } from "@/lib/courses/courses-tab";
import { formatMessage, type CoursesMessages } from "@/lib/i18n/messages";

export function CoursesPageTop({
  selectedSchool,
  allowedSchools,
  activeTab,
  query,
  courses,
  readOnly = false,
}: {
  selectedSchool: SchoolCode;
  allowedSchools: SchoolCode[];
  activeTab: CoursesTab;
  query: string;
  courses: CoursesMessages;
  readOnly?: boolean;
}) {
  const schoolLabel = getSchoolLabel(selectedSchool);

  return (
    <header className="min-w-0 space-y-2">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div
          className="pointer-events-none invisible flex items-center justify-start gap-1.5"
          aria-hidden
        >
          <span className="inline-flex h-9 w-9 shrink-0" />
        </div>
        <h1 className="page-screen-title min-w-0 truncate text-center">{courses.screenTitle}</h1>
        <div className="flex shrink-0 items-center justify-end gap-1.5">
          <CoursesSchoolSelect
            value={selectedSchool}
            allowedSchools={allowedSchools.length > 0 ? allowedSchools : undefined}
            variant="toolbar"
            className="w-auto max-w-[7.5rem]"
            disabled={readOnly}
          />
          <p className="sr-only">
            {formatMessage(courses.schoolSelectSrSuffix, { school: schoolLabel })}
          </p>
        </div>
      </div>

      <CoursesEntryTabs
        activeTab={activeTab}
        selectedSchool={selectedSchool}
        query={query}
        courses={courses}
        disabled={readOnly}
      />
    </header>
  );
}
