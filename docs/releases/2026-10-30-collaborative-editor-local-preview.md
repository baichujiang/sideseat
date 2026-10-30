# Collaborative editor — local review delivery, 2026-10-30

- Implementation source: `f9dd9dedabcbcae2afbb81b70bdd3d578ac9985f`, current
  branch `codex/ios-uxui-20260922`. This record is committed separately so it can
  identify the complete verified implementation commit.
- User-facing deliverable: actual local `/web/plans?create=1` editor on
  `http://127.0.0.1:3344`, with a retained editable demo draft in the visible
  browser. Responsive creation, guest preferences, organizer final arrangement,
  invitation/re-invitation and publishing use the real local APIs/database.
- Verification: 34 targeted tests, focused TypeScript/ESLint, 13 real API checks,
  actual browser workflow and two-account unique Calendar readback. See the
  [QA scope and retained local demo](../qa/2026-10-30-simplified-collaboration-preview.md).
- Vercel: **not deployed**. Current production remains the previously recorded
  `dpl_Bo5cBswyo7cxv6LGqfwA1MwQbGY3`; no alias or remote schema change was made.
  This stage contains an additive local-only migration and must not be shipped by
  replacing production with the whole checkout. Unlimited-capacity work remains
  excluded from production.
- Native Preview remains260, ordinary installed app remains97. No native source,
  build, installation or phone launch was performed for this web-only preview.
- User startup TypeScript edits remain unstaged and unchanged by this stage.
