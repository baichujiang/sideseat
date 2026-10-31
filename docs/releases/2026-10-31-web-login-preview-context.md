# Login preview context and password layout — 2026-10-31

Source: `d09173d57b51295804c83e3482416ab02cbbdd3e`, current branch
`codex/ios-uxui-20260922`. Local preview only; no Vercel/native/schema release.

The owner reported a rejected password and a misplaced eye icon in the existing
Chrome localhost login tab. The3344 server remained healthy, with its verified
working directory in the active checkout and an established connection to the
isolated loopback15434 test database. An existing owned QA session returned200
from `/api/v1/me`. The login route returns401 for either an unknown account or
password mismatch, and503 for database reachability failures. No real-user
password was read, retried against production, changed, or diagnosed as incorrect.
The production mobile account database is separate from this local preview.

Actual Chrome inspection reproduced an18×18 static eye below the field: updated
markup was present while the global password styles were missing. Password styles
now live in a CSS Module imported by the component. A flex group places a44×44
toggle inside the right border, without absolute positioning or overlap with text.
The control remains48px high, with the icon centered vertically and its button5px
inside the right edge. Original show/hide, field metadata and reset behavior remain.

The server-rendered login passes a local-preview flag only in development when
DATABASE_URL has a loopback host. Such pages clearly state that separate test
accounts are used and link to the official login; phone-account wording is removed
from this context. Production rendering keeps normal account wording.401 and503
now have distinct concise Chinese frontend messages without changing auth rules.

Verification: focused TypeScript, ESLint, whitespace checks and an independent
read-only React/CSS/accessibility review pass. A new Chrome page verifies show/hide
and Space activation, an owned QA account with a deliberate invalid test password
shows the new401 message, and390px layout has no horizontal overflow. Desktop icon
center offset is0px;390px offset is under0.01px, toggle44×44. The owner's original
login tab was refreshed, then independently remeasured:44×44 and0px offset, password
hidden and environment note visible. No real-user credential was resubmitted.
The temporary responsive override was reset. No new account, session or business
record was created. Existing services, local demo records and unrelated TypeScript
edits were preserved.

Actual-page capture: `/tmp/sideseat-login-layout-20261031/login-fixed.png`.
