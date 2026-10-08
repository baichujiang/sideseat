# Recommendation bookmarks and first messages — local QA

Checkout: `/Users/baichu/Desktop/项目/app开发项目/Sideseat-ios-uxui`
Branch retained: `codex/ios-uxui-20260922`.

## Implemented

- Recommendation footer: private bookmark icon + Send message. Saved intentions are accessible from the list header; unavailable saved cards cannot start contact.
- A first message requires 1–500 characters, includes a safe target-intention snapshot, and remains a message request until a written recipient reply. No automatic sending when the composer opens.
- Inbox presents sender identity, original text and intention, with Ignore / Reply. Incoming pending requests count toward the Messages badge. Reply preserves the original text and response in contextual chat. Ignore closes the opportunity and permits rematching.
- Pair/intention/opportunity locks protect concurrent sends and replies. Ownership, blocks, moderation, lifecycle and existing connection state are checked. Legacy YES cannot bypass a pending request.
- New additive Prisma migration, participant-scoped API, OpenAPI-generated client, native models/cache, and EN/ZH/DE copy are included. Push routes open `/inbox` and refresh the inbox.

## Verification

- Prisma generation and isolated `sideseat_ios_test` migration deployment: passed; no production database used.
- TypeScript `tsc --noEmit --incremental false`: passed.
- PostgreSQL first-message integration + existing opportunity contract tests: **8 passed**. Includes private save, concurrent initial sends, unauthorized access, original target snapshot, private-note exclusion, sender self-reply rejection, legacy decision rejection, recipient reply + 3 ordered chat records, ignored request, block and expiry.
- OpenAPI generation: passed without diagnostics.
- Xcode Development `build-for-testing`: passed.
- Native DiscoverStoreTests, InboxStoreTests and four focused UI tests: **66 tests passed**, zero failures (69 parameterized executions).
- UI checks cover private bookmark/filter, blank-send disabled, sent state, incoming ignore/reply, draft-preserving retry, and large German text.
- `git diff --check`: passed.

Initial UI run found an existing Save intention translation collision and outdated TextView selectors. Both were corrected; final run passes.

Evidence: `/tmp/sideseat-requests-ui-v2.xcresult`, `/tmp/sideseat-requests-backend-test.log`, `/tmp/sideseat-requests-tsc-final.log`; screenshots in `docs/visual-qa/opportunity-{bookmark-message,message-composer,message-sent,message-incoming}-zh.png` and `opportunity-bookmark-message-large-de.png`.

## Preview / release boundary

Simulator: **SideSeat UX QA**, `AEBD816E-53A7-4012-B76A-FEF82CF02A6B`. The Chinese preview uses offline local fixtures, including an incoming request in Messages. Real two-participant persistence was exercised through the isolated PostgreSQL service test. Live-login UI tests were updated but not executed against real accounts. No production deployment, production migration, TestFlight release, or real push notification was performed. Deploy the additive database migration before deploying the server changes.

## Header greeting and heart follow-up

Moved the contact button beside the avatar/name and renamed its initial action to **打个招呼 / Say hello / Sag Hallo**. The bottom-left bookmark now uses an outline heart, filling red when saved. The first-message composer and private saved-intention behavior remain connected. Development build and the existing bookmark/send + large-text UI checks passed (`/tmp/sideseat-heart-header-ui.xcresult`). The Chinese simulator preview was reopened with offline fixtures.

## Bottom action buttons follow-up

Both actions now sit in the footer: a soft pink heart button labeled Interested / Interest shown (private bookmark), and a contrasting Say hello button. They share a 48-point minimum height, equal widths and rounded corners; accessibility text sizes use a vertical stack. Removed the header action and footer separator. Existing sent, unavailable, reply and open-chat states remain connected.

Development build and both existing UI checks (bookmark/send in Chinese and large text in German dark mode) passed in `/tmp/sideseat-bottom-actions-ui.xcresult`. Updated screenshots: `opportunity-bookmark-message-zh.png` and `opportunity-bookmark-message-large-de.png`. Verified local fixtures only.
