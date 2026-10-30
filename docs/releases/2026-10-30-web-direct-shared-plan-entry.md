# Direct entry to shared plans — 2026-10-30

Status: deployed and verified. Root/www/api point to READY `dpl_CgvMZYefoGM7TpvQqXTkdPars2W2`. The exact Production candidate was promoted without rebuilding.

## Behavior

The name field, timetable and invitation details now appear together immediately. Guests may choose time slots before entering a name; submitting their response creates the guest identity and saves the selection. Invitations and activity suggestions likewise create the identity when the guest takes the action. Missing names are explained at the input. Pending anonymous selections remain local drafts, including after reload or while switching participants; existing personal recovery links and submitted responses remain supported.

## Source and scope

Source commit: `2488b6a210c51d6422e0b7fbd9fcb8881ed38cd5`. The isolated candidate started from READY `dpl_8THpobYYYsaGDMoPJ3CVZrjkzaSN`, preserving 1,436 production files, applying only the two shared-page/hook changes, and adding a provenance marker. All 1,439 remote source SHA1 values matched the candidate manifest. Unshipped capacity changes, backend, API, native sources and unrelated active-checkout modifications were excluded. Existing production capacity rules remain unchanged. Migrations and activity-release hooks were skipped.

## Verification

Focused ESLint and TypeScript checks passed, along with the 25 existing time-poll tests. The existing guest-recovery browser test was updated for the new entry flow, but the full browser E2E suite was not run. The Vercel Production build passed compilation, lint, types and static generation.

Local browser checks covered direct entry, choosing before entering a name, missing-name feedback, anonymous draft reload, submission, switching participant and preserving a draft over reload, two separate guest responses and counts, fixed-time invitation acceptance, activity suggestion while preserving availability, and personal-link recovery. The responsive layout was inspected at 390×844 and desktop size. No physical phone, Safari, or light-theme test is claimed.

The protected candidate login and guest submission were checked before promotion; the previous production API read back the guest's submitted slots. On the public domain, a fresh guest selected a time, reloaded the anonymous draft, filled a name and submitted; the response and count appeared. A separate fixed-time guest entered a name and confirmed directly. The mobile page was inspected at 390×844 without page-wide horizontal overflow. Two owned local and two owned production QA accounts were deleted; both production plan endpoints returned 404 after cleanup. No other users' data was changed.
