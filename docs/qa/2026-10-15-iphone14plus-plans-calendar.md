# iPhone 14 Plus — Plans and Calendar verification

Status: dated physical-device evidence, 2026-10-15, Europe/Berlin.

The owner completed iOS UI Automation authentication and requested continued
Plans/Calendar testing on the new default phone. The installed target was
**SideSeat Preview 1.0.0 (100)** on **iPhone 14 Plus / iOS 26.6.1**, device UDID
ending `C1401E`. The checkout was clean at `3a2837b` on
`codex/ios-uxui-20260922`, after fetching the remote. App source and the installed
Preview were not modified or replaced during this verification.

## Verified flows

| Flow | Observed result |
| --- | --- |
| Navigation and drafts | Plans Overview/Upcoming/Ended, availability/direct-time creation modes, Calendar Month/Week/Day, search exit and event draft cancellation passed. Final native test: **64.261 s**. |
| Availability collection | Native creation, four 15-minute selected slots, autosave, results display, a fresh login restoring the saved name/slots, and deletion passed: **62.779 s**. |
| Personal Calendar | Native create, server search, detail, edit, search/reopen with the edited title, delete and empty search after cleanup passed: **58.378 s**. |
| Direct plan and Calendar | Native creation showed 1/2 confirmations. The second temporary account opened the invitation in the app and accepted; the creator reopened the confirmed plan in Upcoming, found its read-only Calendar detail and used Manage Plan to reach the same 2/2-confirmed root. Final acceptance/route test: **67.685 s**. |

Read-only authenticated API checks from the Mac independently observed zero
Calendar projections for either account before confirmation, then exactly one
projection per account after confirmation. Cancelling the test plan through the
authenticated API removed both projections; deletion then removed the test root.
The cancel action itself was exercised through the API, not the phone UI.

Four selected native cases have passing evidence across the local result bundles.
This is a combined verdict across focused runs, not a claim that every earlier
attempt or the first four-case bundle passed.

## Isolation and cleanup

Preview 100 was still displaying its login screen when the automated check began.
Two new disposable accounts were therefore created through the ordinary signup
API. All business writes targeted those accounts. The app used
`EphemeralCredentialStore` and real authenticated production API requests, without
fixture authentication or owner Keychain changes. No real-user messages or
invitations were sent.

Both temporary accounts were deleted after their plan lists were empty, and both
deleted-account tokens returned **401**. The personal test event and both test
polls were removed. The temporary UI runner was uninstalled. Preview 100 was
launched normally with an empty argument list; PID **869** was present on the
subsequent process check. Ordinary SideSeat **97** remains installed.

No app-code change, backend deployment, migration, feature-flag change or Apple
distribution occurred. The existing release records backend deployment
`dpl_4vBvPch35jxdarqmgnxmvSsGSt6u`; this run verified real API behavior and public
client configuration but did not independently re-inspect that deployment ID.

## Test setup corrections and limits

The earlier UI Automation passcode wait was an infrastructure prerequisite.
During this run the test script was adjusted to the actual iOS search controls:
the system Close button ends active search, then Done exits the full-screen page.
The app's search UI was not changed. An auxiliary HTTP request from the separate
QA runner was denied Wi-Fi access by iOS; confirmation was rerun entirely through
the permitted Preview app, with independent API checks performed on the Mac.
These setup failures remain in the private raw results and are not app-function
failures or passing test cases.

This verifies the described two-account workflows on the new phone. It does not
repeat the earlier five-person acceptance, every recurrence/gesture/calendar
connection, Apple Calendar write-back, APNs delivery or a full regression suite.

## Evidence

- [Machine-readable results](./evidence/2026-10-15-iphone14plus-plans-calendar/results.json)
- [Both participants confirmed](./evidence/2026-10-15-iphone14plus-plans-calendar/two-person-confirmed.png)
- [Shared-plan Calendar detail](./evidence/2026-10-15-iphone14plus-plans-calendar/calendar-shared-plan.png)
- [Edited personal event](./evidence/2026-10-15-iphone14plus-plans-calendar/calendar-edited.png)

Private raw results, UI trees, videos and the temporary test source remain under
`/tmp/sideseat-iphone14plus-smoke-20261015/`; they are not committed. Temporary
credential and invite-token files were removed after cleanup.
