# Little Companions — system avatars

Updated: 2026-09-09. Status: native avatars released in internal TestFlight Build 38;
phone acceptance pending. See the [release record](./releases/2026-09-09-testflight-38.md).

## Product and design

Owner-selected direction: minimal, friendly, recognizable animals. Twenty original
vector portraits use ten animal silhouettes with two color variants each. They
share close-up framing, quiet pastel backgrounds and simple faces that remain
recognizable at chat-list sizes. No third-party character artwork or external
image service is used for this set.

[Contact sheet](./design/system-avatars-v1.svg)

In iOS: Me → avatar camera → choose a system avatar → Save avatar. The sheet
shows a live preview, localized names, selection ring/checkmark, an explicit save
action and Cancel. Choosing a photo from the library remains available through
the existing upload flow. Selection is not persisted until Save is tapped.

The sheet uses the existing native `ssFlowSheet` and `SSFlowActionDock`. Controls
have 44pt-or-larger targets; accessibility sizes use a single column on iPhone
and a compact Save label without the pinned explanatory paragraph. Selected
state is exposed to accessibility and is not communicated by color alone.

## Identity and integration contract

- Persisted identities remain `p01` through `p20`; no database migration or
  bulk rewrite of user profiles is needed. Existing preset users receive the new
  artwork for their existing ID when they update the app.
- iOS bundles all 20 SVGs in `SystemAvatar-pXX` asset-catalog entries. Preset
  display needs no network fetch; the common resolver also recognizes existing
  `/avatars/pXX.jpeg` and new `/avatars/companions-v1/pXX.svg` relative paths.
- `InitialAvatar`, `ProfileAvatar` and group collage tiles share resolution.
  Contact, group-member-selection and Calendar-share rows now pass their actual
  avatar fields rather than displaying a name-only placeholder.
- Custom photo URLs remain unchanged. Missing/invalid values use `p01`.
- Native selection uses the existing authenticated `POST /api/profile/avatar`
  with `{ "avatarId": "pXX" }`. Native access bearers are accepted by its
  existing session layer. No new endpoint or authorization scheme was added.
- Web source resolution uses versioned `/avatars/companions-v1/pXX.svg` assets;
  the old JPEG files remain untouched. Static `/avatars/` resources skip page
  middleware, like `/icons/`, so image requests do not become login HTML.
  API and page authorization are unchanged. This does not reopen the retired
  legacy web app.

## Verification

- `npm run test:profile`: 11 passed, including byte-identical native/web assets
  for all 20 IDs and preservation of custom photo URLs.
- Native `ProfileStoreTests`: 13 passed, including loading every bundled image,
  Chinese/German name coverage, legacy-ID resolution, preset save authorization
  and the existing custom-photo upload regression.
- Local real API test `e2e/api-system-avatars.spec.ts`: passed. Two seeded local
  accounts verified `p05` and `p20` save → own reload → connected viewer's public
  profile, plus direct SVG responses without redirects. Original preset restored.
- Database scope: isolated `sideseat_system_avatars_20260908` on loopback port
  5433, migrated and seeded locally. No production account or Outcome data changed.
- Chrome verified that the local SVG renders as an image after the routing fix.
- Native picker XCUITest passed on the iOS 26.5 iPhone simulator: Chinese
  light and German dark with the largest accessibility text size. Verified
  select → save → reopen, unchanged-save disabled, scroll/select `p20`, and
  Cancel preserving the saved preset. Screenshots were visually inspected.
  The sheet explicitly inherits the page's Dynamic Type setting; this fixed a
  discrepancy discovered during screenshot review. Result:
  `/tmp/SideSeatSystemAvatars-20260908-r7.xcresult`.
- TypeScript no-emit check, focused ESLint, new/changed TypeScript and new-record
  Prettier checks, all three localization-file property-list checks, and
  `git diff --check` passed. Existing table formatting in `DESIGN_SYSTEM.md`
  was preserved rather than reformatted outside the new avatar section.

Local evidence: `docs/visual-qa/system-avatars-zh-Hans-light.png`,
`system-avatars-de-dark.png`, `system-avatars-last-zh-Hans-light.png` and
`system-avatars-last-de-dark.png` (screenshots are git-ignored). Native store
results are in `/tmp/sideseat-system-avatars-native-r4.log`; API results in
`/tmp/sideseat-system-avatars-e2e-r2.log`. Test servers were stopped afterward.
The simulator UI uses authenticated fixtures; the separate two-account API test
uses the real local database. This is not a physical-device/TestFlight acceptance.

## Next step

Ask both internal test phones to update to the available Build 38 and
confirm that a saved avatar is visible in Me, Messages and the peer's profile.
Native assets are offline and use the existing API; no migration or backend/web
deployment is required for this native release. The matching versioned web assets
and middleware are committed but their web rollout is deferred; do not enable the
legacy web app. The unrelated local Info.plist edit and old `.xcarchive` directories
remain preserved outside the release source.
