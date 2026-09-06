-- Reconcile historical schema drift before B-light domain migrations.
--
-- AvailabilityShare was shipped with two physical representations across
-- environments:
--   * selectedDates TEXT[] (the canonical migration history), and
--   * includedDates JSONB (the Prisma/runtime contract).
--
-- This migration accepts either representation, as well as the temporary
-- two-column state. It never overwrites conflicting data. PostgreSQL holds an
-- ACCESS EXCLUSIVE lock for the conversion so concurrent writes cannot race
-- the validation/backfill/drop sequence.

BEGIN;

LOCK TABLE "AvailabilityShare" IN ACCESS EXCLUSIVE MODE;

DO $reconcile_availability_share$
DECLARE
  has_selected_dates BOOLEAN;
  has_included_dates BOOLEAN;
  selected_dates_type TEXT;
  included_dates_type TEXT;
  conflict_count BIGINT;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'AvailabilityShare'
      AND column_name = 'selectedDates'
  ) INTO has_selected_dates;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'AvailabilityShare'
      AND column_name = 'includedDates'
  ) INTO has_included_dates;

  IF NOT has_selected_dates AND NOT has_included_dates THEN
    RAISE EXCEPTION
      'AvailabilityShare reconciliation requires selectedDates or includedDates';
  END IF;

  IF has_selected_dates THEN
    SELECT udt_name
    INTO selected_dates_type
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'AvailabilityShare'
      AND column_name = 'selectedDates';

    IF selected_dates_type IS DISTINCT FROM '_text' THEN
      RAISE EXCEPTION
        'AvailabilityShare.selectedDates has unsupported type: %',
        selected_dates_type;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM "AvailabilityShare" AS share
      CROSS JOIN LATERAL unnest(share."selectedDates") AS selected_date(value)
      WHERE selected_date.value IS NULL
         OR selected_date.value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    ) THEN
      RAISE EXCEPTION
        'AvailabilityShare.selectedDates contains a non-date string';
    END IF;
  END IF;

  IF has_included_dates THEN
    SELECT udt_name
    INTO included_dates_type
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'AvailabilityShare'
      AND column_name = 'includedDates';

    IF included_dates_type IS DISTINCT FROM 'jsonb' THEN
      RAISE EXCEPTION
        'AvailabilityShare.includedDates has unsupported type: %',
        included_dates_type;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM "AvailabilityShare" AS share
      WHERE share."includedDates" IS NOT NULL
        AND jsonb_typeof(share."includedDates") NOT IN ('array', 'null')
    ) THEN
      RAISE EXCEPTION
        'AvailabilityShare.includedDates must be a JSON array or null';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM "AvailabilityShare" AS share
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(share."includedDates") = 'array'
            THEN share."includedDates"
          ELSE '[]'::jsonb
        END
      ) AS included_date(value)
      WHERE jsonb_typeof(included_date.value) <> 'string'
         OR included_date.value #>> '{}' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    ) THEN
      RAISE EXCEPTION
        'AvailabilityShare.includedDates contains a non-date string';
    END IF;
  END IF;

  IF has_selected_dates AND has_included_dates THEN
    SELECT COUNT(*)
    INTO conflict_count
    FROM "AvailabilityShare" AS share
    WHERE (
      SELECT COALESCE(
        jsonb_agg(to_jsonb(selected_date.value) ORDER BY selected_date.value),
        'null'::jsonb
      )
      FROM (
        SELECT DISTINCT value
        FROM unnest(share."selectedDates") AS selected(value)
      ) AS selected_date
    ) IS DISTINCT FROM (
      SELECT COALESCE(
        jsonb_agg(to_jsonb(included_date.value) ORDER BY included_date.value),
        'null'::jsonb
      )
      FROM (
        SELECT DISTINCT element #>> '{}' AS value
        FROM jsonb_array_elements(
          CASE
            WHEN jsonb_typeof(share."includedDates") = 'array'
              THEN share."includedDates"
            ELSE '[]'::jsonb
          END
        ) AS element
      ) AS included_date
    );

    IF conflict_count > 0 THEN
      RAISE EXCEPTION
        'AvailabilityShare contains % row(s) with conflicting selectedDates and includedDates',
        conflict_count;
    END IF;

    ALTER TABLE "AvailabilityShare" DROP COLUMN "selectedDates";
  ELSIF has_selected_dates THEN
    ALTER TABLE "AvailabilityShare" ADD COLUMN "includedDates" JSONB;

    UPDATE "AvailabilityShare" AS share
    SET "includedDates" = (
      SELECT CASE
        WHEN COUNT(*) = 0 THEN NULL
        ELSE jsonb_agg(to_jsonb(selected_date.value) ORDER BY selected_date.value)
      END
      FROM (
        SELECT DISTINCT value
        FROM unnest(share."selectedDates") AS selected(value)
      ) AS selected_date
    );

    ALTER TABLE "AvailabilityShare" DROP COLUMN "selectedDates";
  END IF;

  -- Empty selections and JSON null both mean that the full date range is
  -- shared. Persist one representation so the nullable Prisma field remains
  -- unambiguous.
  UPDATE "AvailabilityShare"
  SET "includedDates" = NULL
  WHERE "includedDates" IN ('null'::jsonb, '[]'::jsonb);
END
$reconcile_availability_share$;

-- The TUM default was required only while backfilling the original NOT NULL
-- column. Current and N-1 request paths always provide an explicit school;
-- silently assigning a missing value to TUM is unsafe in a multi-school app.
ALTER TABLE "SchoolEmailVerification"
  ALTER COLUMN "school" DROP DEFAULT;

COMMIT;
