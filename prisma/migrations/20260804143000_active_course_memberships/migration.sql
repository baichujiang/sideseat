ALTER TABLE "UserCourse"
ADD COLUMN "activeUntil" TIMESTAMP(3);

ALTER TABLE "Course"
ADD COLUMN "identityCode" TEXT;

UPDATE "Course"
SET "identityCode" = NULLIF(
  UPPER(REGEXP_REPLACE(BTRIM("code"), '[[:space:]]+', '', 'g')),
  ''
);

CREATE FUNCTION set_course_identity_code()
RETURNS TRIGGER AS $$
BEGIN
  NEW."identityCode" := NULLIF(
    UPPER(REGEXP_REPLACE(BTRIM(NEW."code"), '[[:space:]]+', '', 'g')),
    ''
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER course_identity_code_write
BEFORE INSERT OR UPDATE OF "code" ON "Course"
FOR EACH ROW
EXECUTE FUNCTION set_course_identity_code();

-- Existing memberships remain current through the academic semester in which
-- this migration is deployed. No enrollment, chat, post, or schedule is deleted.
UPDATE "UserCourse"
SET "activeUntil" = CASE
  WHEN EXTRACT(MONTH FROM CURRENT_DATE) BETWEEN 4 AND 9 THEN
    make_date(EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER, 9, 30) + TIME '23:59:59.999'
  WHEN EXTRACT(MONTH FROM CURRENT_DATE) >= 10 THEN
    make_date(EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER + 1, 3, 31) + TIME '23:59:59.999'
  ELSE
    make_date(EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER, 3, 31) + TIME '23:59:59.999'
END;

CREATE INDEX "Course_school_code_idx" ON "Course"("school", "code");
CREATE INDEX "Course_school_identityCode_idx" ON "Course"("school", "identityCode");
CREATE INDEX "UserCourse_courseId_activeUntil_idx" ON "UserCourse"("courseId", "activeUntil");
CREATE INDEX "UserCourse_userId_activeUntil_idx" ON "UserCourse"("userId", "activeUntil");
