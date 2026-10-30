# Shared-plan copy and invitation-time correction — 2026-10-30

Status: deployed and verified. Root/www/api point to READY `dpl_8THpobYYYsaGDMoPJ3CVZrjkzaSN` (`sideseat-pajikj96y-baichus-projects.vercel.app`). The staged Production build was promoted without rebuilding.

The shared plan page now uses direct task headings and concise action labels across name entry, availability selection, activity ideas and invitation replies. Repeated introductory, platform and next-step explanations were removed. Submission state, time zone, selection legend, recovery-link privacy, capacity and explicit attendance confirmation remain visible where needed. Full-capacity guidance appears once before the name form. Adding an activity says “添加提议”; a pending invitation says “拟定时间，待确认”; a participant's acceptance remains distinct from the organizer publishing the plan. English copy follows the same structure.

This release also includes the previously verified web final-time correction: without a saved interval, the dialog keeps the first future candidate day's complete range, including 12:00–15:30. Saved intervals retain their endpoints. The organizer's “约好了” heading is restricted to CONFIRMED.

## Source and scope

Copy source: `efcf9fe8a46e8023d5a7aed006d3a3c2ed9225d8`. Time implementation: `6350c987`, with the isolated time-only patch reviewed in `d008f2f2`. The production baseline is READY `dpl_Hgsjz93Y96bCmmkdYmmSHw8ubkzS`, whose 1,437 remote source hashes were checked against its cached package. The new package preserves 1,432 files, overlays four shared-page components and the organizer's time-only component, and adds one provenance marker. All 1,438 uploaded source SHA1 values match the prepared manifest.

The five unshipped unlimited-capacity expressions in the shared component were restored to the existing production contract for this package. Backend, OpenAPI, existing capacity semantics, assets and native sources retain their production hashes. Database migrations and activity release hooks are explicitly skipped. No native build, phone installation or distribution is included.

## Local verification

The existing active-checkout server on port 3344 was reused after checking its process working directory and loopback database connection. One owned disposable account and four plans covered actual browser name entry, half-hour selection/submission, invitation deferral, acceptance, organizer publication, activity suggestion/interest, full capacity and cancellation. API readback retained the submitted slots, separate RSVP/publication phases and activity idea. Both Chinese and English were inspected. Viewports 1440×900, 390×844 and 320×720 showed no document horizontal overflow; desktop left/right captures and mobile captures were reviewed in the existing dark appearance. No physical-phone, Safari, light-theme or complete browser E2E-suite run is claimed.

Focused ESLint and whitespace checks passed; all 25 existing time-poll tests passed. Full-source TypeScript checking passed with a temporary configuration selecting only the running server's current generated route types; the owner's existing configuration/reference edits were preserved. Existing E2E text selectors were updated, not a new test suite. A fixture setup initially used cancellation version zero and was corrected to the existing invitation-version contract. One short final-feedback wait expired before the subsequent accessibility and API reads confirmed the saved response; no failed business action or repeat submission was hidden.

The local QA account was deleted, its old cookie returned 401 and all four public plan APIs returned 404. Its credential files were removed.

## Publication and live verification

The project was freshly observed as unpaused before this release; this task did not change the pause setting. The candidate build completed compilation, lint/type validation and output deployment successfully. Its browser URL reached Vercel SSO, so authenticated `vercel curl` verified HTTP 200 for the login page and the owned public plan API before promotion. Source hashes were verified in full, and the prior baseline was checked on all three aliases immediately before the promotion request. Browser UI acceptance below ran on the promoted public domain, not through a weakened protection setting.

Two owned registered QA accounts and two owned plans supplied production validation. The guest's initial availability response was prepared before promotion. After promotion, the organizer's real browser dialog defaulted to 12:00–15:30 and sent those exact values. API readback retained the existing cap of 20. The second registered account accepted through its authenticated API; the guest accepted in the browser, which displayed the distinct waiting-for-organizer status. The organizer published from the browser; its heading became “这次，我们约好了。” and the guest page became “计划已确定” / “已确认参加”. Each registered account's schedule contained exactly one matching Calendar entry.

The live activity branch accepted a guest name and saved a suggestion through the new “添加提议” action. The shared-page recovery, selection, invitation and participant copy was visibly updated; English name-entry layout at 320 px had no horizontal document overflow. Actual live mobile captures were reviewed. A bounded deployment error-log query returned zero records. These checks do not certify unrelated pages, native UI or future traffic.

Both owned production accounts were deleted; old cookies returned 401 and both public plan APIs returned 404. Private QA credentials were removed. Final metadata reads confirmed READY and all three aliases on the same deployment. [Sanitized source and verification evidence](../qa/evidence/2026-10-30-web-plan-copy/verification.json).
