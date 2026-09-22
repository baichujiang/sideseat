# SideSeat Privacy

**Status:** Current internal App Store disclosure source; per-build audit required

**Last updated:** 2026-09-02

**Governing release procedure:** [Release](./RELEASE.md)

**Scope:** Production iPhone data categories, enabled providers and disclosure consistency

All categories below are currently marked as not used for cross-company tracking.

| Apple category | Linked to user | Purpose | SideSeat use |
| --- | --- | --- | --- |
| Name | Yes | App Functionality | Display name and profile identity |
| Email Address | Yes | App Functionality | Optional sign-in, verification and recovery |
| Phone Number | Yes | App Functionality | Optional sign-in and recovery |
| Other User Contact Info | Yes | App Functionality | Contact details a user chooses to exchange |
| Precise Location | Yes | App Functionality | Location explicitly shared in a chat |
| Coarse Location | Yes | App Functionality | Approximate location explicitly shared in a chat |
| Photos or Videos | Yes | App Functionality | Avatar, life photos, legacy posts and chat attachments |
| Other User Content | Yes | App Functionality | Messages, Plans, calendar data, Weekly Intents, declared availability, legacy posts/activities and optional verification documents |
| Customer Support | Yes | App Functionality | Feedback and reports submitted by the user |
| User ID | Yes | App Functionality, Analytics | Identity, ownership and first-party funnel attribution/deduplication |
| Device ID | Yes | App Functionality | APNs token and device registration |
| Purchase History | Yes | App Functionality | Verified optional StoreKit support purchase |
| Product Interaction | Yes | Analytics, App Functionality | Body-free impression/open/Intent/session/Opportunity/Plan lifecycle events |
| Crash Data | No | Analytics | Sentry diagnostics when enabled |
| Performance Data | No | Analytics | Sentry performance diagnostics when enabled |

## On-device processing

- Calendar voice transcription uses Apple's on-device speech recognition; audio is
  not sent to SideSeat or DashScope.
- Timetable screenshot recognition uses Apple Vision on device. The image is sent
  only if the user separately uploads/publishes it through an enabled flow.
- Keychain credentials and local preferences remain on device except when an auth
  credential is presented to the API.

## Provider mapping

| Provider | Role | Release check |
| --- | --- | --- |
| Vercel | Web/API hosting and request processing | Region, DPA, access and deployed environment |
| Neon | Product database | Retention and restore drill |
| Vercel Blob | Private uploaded-object storage | Access and cleanup policy |
| Resend | Verification/recovery email | Domain and retention terms |
| Twilio or replacement | Phone OTP when enabled | Disclose only when production-enabled |
| Alibaba DashScope | Explicit smart-add prompt processing | Send only after user action; no private Calendar corpus |
| Apple APNs | Device token and notification delivery | Minimize lock-screen payload |
| Apple StoreKit | Optional transaction identity | Strict verification when enabled |
| Sentry | Unlinked crash/performance diagnostics | `sendDefaultPii=false`; no identity tags |

## First-party event rules

- Never include message/post bodies, precise location or private Calendar content.
- Use stable UUID/idempotency to avoid duplicate business-state events.
- Retain product funnel events for at most 180 days.
- Delete or irreversibly detach linked analytics when the account is deleted.
- Impression requires the defined visibility threshold; server-owned state changes
  are recorded by the authoritative service.

## Consistency rules

1. `PrivacyInfo.xcprivacy`, this document and App Store Connect must describe the
   same production build.
2. If diagnostics become linked to identity, change both configuration and Store
   disclosure before release.
3. If recognition moves server-side, disclose uploaded audio/image and provider.
4. Re-audit after adding analytics, matching inputs, SDKs, providers or retention.
5. SideSeat currently declares no tracking domains or cross-company tracking.

Reference: [Apple — App privacy details on the App Store](https://developer.apple.com/app-store/app-privacy-details/).
