# Preview 100 — installation on the default iPhone 14 Plus

Status: dated device delivery evidence, 2026-10-15, Europe/Berlin.
The owner requested the latest app on the newly selected default test phone.

## Source and build

- Active checkout: `/Users/baichu/Desktop/项目/app开发项目/Sideseat-ios-uxui`.
- Branch: `codex/ios-uxui-20260922`.
- Build source: `268a715499efb452bddfcbbc8d0389bb248f52ba`; the working tree
  was clean and matched the fetched remote, ahead/behind 0/0.
- This source retains the native implementation from
  `6d5e6b5137c78e49291805b1a9989ac462fb209f`. No app source changed.
- App: **SideSeat Preview / app.sideseat.mobile.preview / 1.0.0 (100)**.
- Target: **iPhone 14 Plus / iOS 26.6.1**, UDID
  `00008110-001A69110CC1401E`, CoreDevice
  `D906CC6D-3EC6-50A2-8D93-A6602521362A`.
- Developer Mode, paired status and the wired connection were verified.
- The earlier signed artifact matched the original release's executable hash,
  but its profile did not include this phone. Automatic development provisioning
  registered the phone. An incremental build left an invalid resource seal;
  that artifact was not installed. A fresh build in a separate temporary
  DerivedData directory completed successfully.
- The new app passed `codesign --verify --deep --strict`; its embedded profile
  includes the exact target UDID. Bundle, build and API identity were checked
  before installation; the built app targets the iPhone device family.
- Signed executable SHA-256:
  `4ed9924dc604b379209d5bdd0f81f5d1e0962d079f6f3a6c3f4e6c51a1070480`.

## Installation and startup checks

- `devicectl` installation succeeded on the explicitly selected iPhone 14 Plus.
- Both the device app inventory and Xcode Devices show Preview **100** installed.
  Ordinary SideSeat **97** remains separately installed.
- Normal foreground launch succeeded at **18:07 Europe/Berlin**, with no app
  launch arguments or account overrides; PID **670** was still present on the
  subsequent process check.
- A screenshot taken from this phone through Xcode shows the rendered Chinese
  login screen and the first-launch wireless-data permission dialog. The owner
  was asked to allow network access and sign in on the phone before authenticated
  checks can proceed.
- Raw local receipts and the screenshot are in
  `/tmp/sideseat-iphone14plus-20261015/`. The signed app is in
  `/tmp/sideseat-preview100-iphone14plus-build/Build/Products/Preview-iphoneos/`.

## Backend and verification limits

- The app targets `https://api.sideseat.de`. Its public client configuration
  returned successfully from the Mac, with maintenance mode off.
- The existing Preview 100 release records backend deployment
  `dpl_4vBvPch35jxdarqmgnxmvSsGSt6u`; this installation did not redeploy or
  independently re-inspect that deployment ID.
- Installation and startup are verified on this phone. Phone-side authenticated
  API access, login, Plans/Calendar workflows, APNs and a full regression suite
  are not established by this startup check.
- No account credentials were supplied, no business data was written, and no
  backend, database, TestFlight or App Store release was performed.

The original feature acceptance and backend provenance remain in the
[Preview 100 release](./2026-10-15-preview100-unified-plans.md).

## Subsequent authenticated verification

After the owner completed iOS UI Automation authentication, the
[iPhone 14 Plus Plans/Calendar check](../qa/2026-10-15-iphone14plus-plans-calendar.md)
verified the described four native cases using two disposable accounts, including
confirmation and Calendar routing. Both accounts and test data were removed;
Preview 100 was returned to empty-argument normal launch. This later check does
not change the startup-only scope recorded above or imply a new app/backend build.
