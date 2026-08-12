import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CALENDAR_CATEGORY_PRESET_KEYS,
  resolveCategoryFromPreset,
} from "../../lib/calendar/category-preset";
import { DEFAULT_USER_CALENDAR_PRESETS } from "../../lib/calendar/default-user-calendar-categories";

describe("calendar starter categories", () => {
  it("uses the student-focused Study, Work, and Personal defaults", () => {
    assert.deepEqual(CALENDAR_CATEGORY_PRESET_KEYS, ["study", "work", "personal"]);
    assert.deepEqual(
      DEFAULT_USER_CALENDAR_PRESETS.map(({ presetKey, name }) => ({ presetKey, name })),
      [
        { presetKey: "study", name: "Study" },
        { presetKey: "work", name: "Work" },
        { presetKey: "personal", name: "Personal" },
      ],
    );
  });

  it("does not treat retired priority and fallback buckets as valid smart-add categories", () => {
    const categories = [
      { id: "study-id", name: "Study", presetKey: "study" },
      { id: "important-id", name: "Important", presetKey: "important" },
    ];

    assert.deepEqual(resolveCategoryFromPreset("study", categories), {
      status: "matched",
      categoryId: "study-id",
      presetKey: "study",
    });
    assert.deepEqual(resolveCategoryFromPreset("important", categories), {
      status: "invalid_preset",
      presetKey: "important",
    });
    assert.deepEqual(resolveCategoryFromPreset("other", categories), {
      status: "invalid_preset",
      presetKey: "other",
    });
  });
});
