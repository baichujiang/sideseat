# Intention sharing — first usable version (2026-10-02)

Implemented in the active `Sideseat-ios-uxui` checkout, branch `codex/ios-uxui-20260922`. After explicit user approval, the sharing backend and its additive migration were released to production on 2026-10-02. The signed Preview 82 build was superseded by the already installed Preview 83, whose sharing implementation is identical. Preview 83 was confirmed on the paired phone and launched after backend release. See the [release record](../releases/2026-10-02-intent-share-production.md).

## Experience

- The native active intention card has a share button. It creates/reuses an unlisted link and opens the system share sheet.
- The public mobile page shows the host name, activity, note, and explicitly declared available times. It does not expose the host's calendar, school, email, or other intentions. Link metadata includes the activity and times.
- Viewing the page creates no account. Contact explicitly starts a guest session. Selecting a time can prefill an editable greeting.
- A guest's first message appears in the host's existing native message requests. A written reply opens the canonical direct conversation. The public page polls that conversation while visible.
- Registration happens in a small dialog: editable suggested username + password. The same User ID is upgraded, keeping all messages and connections. School/profile details are not invented. Apple/Google OAuth is not implemented in this first version.
- Saving to the SideSeat calendar requires registration. Registration resumes the calendar form. It saves a private reminder only, with an explicit instruction to confirm the actual meeting with the other person.
- The owner can revoke a link through the authenticated share DELETE endpoint; ending/pausing/expiry also makes the public page unavailable. Registered conversations remain accessible in the app.

## Local preview

The running server belongs to the active checkout, listening on port **3106** (port 3000 belongs to StudiFind and was not used). Database: isolated local `sideseat_intent_share_test` on PostgreSQL port 5433.

Start/reproduce:

```sh
LOCAL_TEST_DB_NAME=sideseat_intent_share_test node scripts/with-local-test-db.mjs npx prisma migrate deploy
LOCAL_TEST_DB_NAME=sideseat_intent_share_test node scripts/with-local-test-db.mjs npx tsx scripts/seed-intent-share-preview.ts
LOCAL_TEST_DB_NAME=sideseat_intent_share_test NEXT_DIST_DIR=.next-intent-share V2_WEEKLY_INTENT_ENABLED=1 V2_MUTUAL_OPPORTUNITY_ENABLED=1 V2_EXPLORE_INTENTS_ENABLED=1 node scripts/with-local-test-db.mjs npm run dev -- --hostname 0.0.0.0 --port 3106
```

The seed script prints the review URL. `share_preview_host` / `SharePreview123!` is an isolated local fixture, not a production account. There is no simulated automatic host reply in the review page; the host reply was tested through the real native API.

## Verification

- PostgreSQL integration test passed: stable owner-only share link; anonymous greeting; retry idempotency; native message-request projection; real owner reply; direct messages; in-place registration; unchanged history; participant isolation; blocking; link revocation.
- Mobile Chromium E2E passed: unauthenticated page does not create a user; anonymous send; reply through native API; second message; guest calendar denial; registration in dialog; calendar save; reload preserves messages; new credentials work through native login; revoked link unavailable. No page errors or horizontal overflow.
- Agent-browser visual check: page and controls render, no framework error overlay; mobile viewport checked.
- TypeScript, targeted ESLint and OpenAPI validation passed. OpenAPI now covers 182 implemented operations; native client regenerated.
- iOS simulator Development build passed (`SideSeat-Development`, dedicated `/tmp/sideseat-intent-share-derived`).

Screenshots: `evidence/2026-10-02-intent-share/public-mobile.png`, `quick-register.png`, `registered-chat.png`.

The full browser test found and fixed a cookie rotation issue: deleting then setting the same cookie in a response could leave the new account unauthenticated. Guest session rows are now revoked before setting a fresh cookie, without first deleting the cookie. The same-origin check also uses the actual Host header rather than the development server's `0.0.0.0` binding address.

## Release boundary

The additive `20261002200000_intent_share` migration and new public routes are now deployed together. Production verification passed all ten checks using temporary QA accounts: native login and link creation, the actual public share domain, anonymous greeting, native inbox and reply, registration preserving history, private calendar save, native login with the registered credentials, and link revocation. QA accounts were removed. The local review URL remains local; native Preview now generates public links usable outside this Mac.
