# SideSeat App Store Privacy Matrix

Use this matrix when answering App Store Connect privacy questions. Re-audit it
whenever a feature, SDK or provider changes. All listed data is marked as not used
for tracking.

| Apple category | Linked to user | Purpose | SideSeat use |
| --- | --- | --- | --- |
| Name | Yes | App Functionality | Display name and profile identity |
| Email Address | Yes | App Functionality | Optional sign-in, verification and recovery |
| Phone Number | Yes | App Functionality | Optional sign-in and recovery |
| Other User Contact Info | Yes | App Functionality | Contact details a user chooses to exchange |
| Precise Location | Yes | App Functionality | Location explicitly shared in a chat |
| Coarse Location | Yes | App Functionality | Approximate location explicitly shared in a chat |
| Photos or Videos | Yes | App Functionality | Avatar, life photos, posts and chat attachments |
| Other User Content | Yes | App Functionality | Messages, plans, calendar data, posts, activities and optional school-verification documents |
| Customer Support | Yes | App Functionality | Feedback and reports submitted by the user |
| User ID | Yes | App Functionality | Account identity and content ownership |
| Device ID | Yes | App Functionality | APNs device token and device registration |
| Purchase History | Yes | App Functionality | Verified optional StoreKit support purchases |
| Crash Data | No | Analytics | Sentry crash diagnostics when the DSN is enabled |
| Performance Data | No | Analytics | Sentry performance diagnostics when the DSN is enabled |

## Data that stays on device

- Calendar voice transcription requires Apple's on-device speech recognition.
  Audio is not sent to SideSeat or DashScope.
- Timetable screenshot text recognition uses Apple Vision on device. The selected
  image is sent to SideSeat only if the user separately uploads or publishes it.
- Keychain refresh credentials and local preferences remain on device except when
  credentials are presented to the API for authentication.

## Provider mapping

| Provider | Data or role | Release check |
| --- | --- | --- |
| Vercel | Web/API hosting, request processing and private verification-document storage | Confirm region, DPA, access controls, 30-day cleanup and deployed env |
| Neon | Account and product database | Confirm retention and restore drill |
| Resend | Email address and verification/recovery messages | Verified domain and retention terms |
| Twilio or replacement | Phone number and OTP when phone sign-in is enabled | Include only if production-enabled |
| Alibaba DashScope | Natural-language calendar prompt text | Sent only after explicit smart-add action |
| Apple APNs | Device token and notification payload | Avoid sensitive content in lock-screen payloads |
| Apple StoreKit | Purchase and transaction identifiers | Strict server verification enabled |
| Stripe | Optional web support payments | Applies to web flow, not iOS StoreKit purchases |
| Sentry | Unlinked crash/performance diagnostics | `sendDefaultPii=false`; verify no user identity tags |

## Consistency rules

1. `SideSeat/Resources/PrivacyInfo.xcprivacy`, this matrix and App Store Connect
   must describe the same production build.
2. If diagnostics are linked to an account later, change both Sentry configuration
   and the Crash/Performance answers before release.
3. If any recognition becomes server-side, disclose the uploaded audio/image and
   provider before enabling it in production.
4. SideSeat declares no cross-company tracking and no tracking domains.
