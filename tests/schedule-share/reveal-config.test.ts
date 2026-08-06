import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isBlockRevealed,
  isRevealUnrestricted,
  normalizeRevealConfig,
} from "../../lib/schedule-share/reveal-config";
import {
  initialRevealedCategoryIds,
  revealConfigFromRevealedCategoryIds,
} from "../../lib/schedule-share/reveal-category-selection";

describe("schedule-share detail privacy", () => {
  it("keeps legacy empty reveal configs unrestricted", () => {
    const reveal = normalizeRevealConfig({
      categoryIds: [],
      presetKeys: [],
      includedDates: [],
    });

    assert.equal(isRevealUnrestricted(reveal), true);
    assert.equal(isBlockRevealed({ internalPresetKey: "personal" }, reveal), true);
  });

  it("supports an explicit hide-all mode for new shares", () => {
    const reveal = normalizeRevealConfig({
      categoryIds: [],
      presetKeys: [],
      hideAllDetails: true,
      includedDates: ["2026-08-04"],
    });

    assert.equal(isRevealUnrestricted(reveal), false);
    assert.equal(isBlockRevealed({ internalPresetKey: "personal" }, reveal), false);
    assert.equal(isBlockRevealed({ internalCategoryId: "custom-calendar" }, reveal), false);
  });

  it("round-trips hide-all through the category selection UI", () => {
    const categories = [
      { id: "personal", name: "Personal", presetKey: "personal", color: "#EA580C" },
    ];
    const reveal = normalizeRevealConfig({ hideAllDetails: true });

    assert.deepEqual(initialRevealedCategoryIds(categories, reveal), []);
    assert.deepEqual(revealConfigFromRevealedCategoryIds(categories, []), {
      categoryIds: [],
      presetKeys: [],
      hideAllDetails: true,
    });
  });

  it("accepts and reveals the active Important calendar preset", () => {
    const categories = [
      { id: "important-id", name: "Important", presetKey: "important", color: "#DC2626" },
    ];
    const config = revealConfigFromRevealedCategoryIds(categories, ["important-id"]);
    const reveal = normalizeRevealConfig(config);

    assert.deepEqual(config, {
      categoryIds: [],
      presetKeys: ["important"],
      hideAllDetails: false,
    });
    assert.equal(isBlockRevealed({ internalPresetKey: "important" }, reveal), true);
  });
});
