# Web calendar and plans interaction audit — 2026-10-30

Source: `b95e460f50d390d53852076011c446b340e050c5`. Production candidate: `dpl_u3vCd6ps1s6JzDwJ7gKTDLqxhtk8`.

Four observed issues were fixed: short-window sidebar wheel scrolling; calendar navigation/selected date drifting apart; a restored availability draft being overwritten by server state; and invitation accept/decline using POST where the existing API requires PUT. No API, database schema, native App, or business rule changes.

Local Mac in-app browser checks covered calendar create/edit/cancel, search and category filter, date navigation, wheel scrolling, plan availability selection, undo, whole day, clear, draft reload, submit, shared plan participation, invitation, acceptance, publish and calendar projection. Two independent QA accounts produced one matching confirmed plan entry per account, read from the shared schedule API. The share dialog displayed a public link; the second account reached the plan directly. Link-copy interoperability and delivery to contacts were not verified. Physical Safari, physical iPhone UI, drag selection, external calendar subscriptions and ICS transfer were not exercised in this audit.

The candidate is built from the verified previous production source: 1,428 baseline files, three web overlays and one provenance marker, 1,429 remote source hashes matched. Focused ESLint passed (CSS is not configured for ESLint). The two local QA accounts were deleted and old cookies returned 401. No ordinary account was used.

The candidate built successfully and its login returned HTTP 200. The same READY build was promoted without rebuilding; root, www and api aliases all resolve to it. On the live site a new plan draft remained selected after reload; two own accounts submitted availability, accepted the invitation, and published it; both shared schedule API responses contained exactly one matching entry. Calendar next-month creation defaulted to November 30. Two production QA accounts and their records were deleted; old cookies returned 401. No physical iPhone test was performed in this audit.
