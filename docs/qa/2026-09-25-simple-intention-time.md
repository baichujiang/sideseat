# Simple intention time — 2026-09-25

## Behavior

The time section now contains two full-width choices. “Time undecided” includes its own explanation (“匹配后再一起商量具体时间。”), instead of showing it as a permanent section footer. Choosing a time directly reveals the existing start/end date-and-time fields and the action to add another time window in the same section.

Removed the date-range/specific-time switch, date-range shortcuts and part-of-day controls from the editor. New timed intentions use exact windows. Switching between undecided and exact keeps the exact-time draft, and publishing submits only the selected timing mode. Existing date-range intentions retain their saved preference and show its summary on the time choice until the user explicitly changes that choice.

The existing 30-minute minimum, 12-hour maximum, future-time and non-overlap constraints remain in place. Optional activity details and publishing from the navigation bar while typing are unchanged.

## Verification

Development build-for-testing and localization syntax checks passed. Updated the existing timing journeys to cover the simplified flow in Chinese/light, English/dark and German/largest text: direct exact-time entry, undecided/exact toggling, adding/removing windows and publishing/reopening. Updated the description-limit journey to verify exact-time preservation when switching activities.

Tests run on SideSeat UX QA (iPhone 17 Pro, iOS 26.5) with local fixtures, ephemeral credentials and a loopback-only API override; no live backend writes.

The first run (`/tmp/sideseat-intention-simple-time-20260925.xcresult`) passed the description-limit/draft-preservation and Chinese light/dark journeys. The two timing journeys exposed test assumptions: compact UIKit date pickers expose their date/time through child buttons rather than a nonempty top-level value, and the largest-text empty page needs its existing scroll-view swipe before revealing Add. Updated those checks and reran the timing and draft-preservation journeys. Timing journeys now publish without entering an activity description.

The next run (`/tmp/sideseat-intention-simple-time-20260925-final.xcresult`) passed the Chinese/English timing journey and the description/draft journey. The German largest-text journey reached the second time window but lost its index-based remove-button query when the first row scrolled out of the native hierarchy. Changed that query to retain the window's stable identifier and scroll back to the remaining time before comparing its value; rerunning only this journey.

Visually inspected `simple-time-exact-zh-Hans-light.png`, `simple-time-exact-en-dark.png`, `simple-time-exact-de-light.png` and the updated undecided state in `docs/visual-qa`. Exact start/end controls appear directly below the two choices; at accessibility sizes they stack vertically and remain within the screen width.

Final large-text run: `/tmp/sideseat-intention-simple-time-20260925-large-final.xcresult` — 1 passed, 0 failed, 0 skipped. All four selected UI journeys have now passed, including timing-mode toggling, adding/removing windows, publishing with blank details, reopening the saved exact time, category-switch draft preservation, Chinese light/dark and German largest text. Final `git diff --check` passed.
