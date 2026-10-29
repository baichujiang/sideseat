# Web/mobile brand alignment — 2026-10-29

Status: source correction verified locally; production update in progress under
the owner's existing authorization to publish the web counterpart at `sideseat.de`.
Baseline production is `dpl_27E69W2D1v5CGphCzP8PqkPSi1LK`.

The new web shell incorrectly introduced an orange `s` badge. Sidebar, login and
signup now share one `WebBrand` component using an exact byte copy of the active
native `BrandMark.png`. The browser/shared-page App icon uses an exact byte copy
of the active native `AppIcon.png`. The 40px mark uses the native22% corner ratio,
with no rotation or reconstructed letters.

The five web navigation symbols now follow native meanings: two people, circle
check, calendar, two chat bubbles and a person. Web uses the existing Lucide SVG
library while iOS uses SF Symbols; these navigation glyphs are corresponding
symbols, not identical platform drawing files. Native App assets and source are
unchanged; no phone build/install is needed.

Verification: exact SHA256 equality with both native image resources, focused
ESLint and React accessibility/component review; local desktop login checked in
the existing active-checkout server on3344. No authentication, API, data model,
database or account changes are part of this correction. Preserve the user's
unrelated `next-env.d.ts` and `tsconfig.json` edits and existing phone QA services.
