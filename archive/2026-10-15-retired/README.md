# Retired implementations — frozen 2026-10-15

**Status:** Archived. Do not maintain, execute, build, deploy or reactivate.

The owner explicitly requested an audit of deployed functionality and retirement
of obsolete code. [Current deployment and compatibility inventory](../../docs/DEPLOYED_STATE.md)
is the starting point for new work. This directory is outside ordinary source
searches, the active native targets, TypeScript, ESLint and Vercel upload inputs.

| Material | Archived location | Retirement basis |
| --- | --- | --- |
| Capacitor webview app, shell and configuration | `ios/`, `ios-shell/`, `capacitor.config.ts` | SwiftUI is the current iPhone client; old packaging was already rollback-only |
| When2meet provider UI, model and original tests | `ios-native/SideSeat/Features/Chat/When2meet*`, corresponding test folders | Recovered read-only from Git `ba8a92b`; replaced by Sideseat-native polls in Preview 99 |
| Preview 98 phone runner | `ios-native/phone-qa/when2meet98/` | Targets removed controls and the external provider; never run against Preview 99 |
| Preview 98 QA, screenshots and release receipt | `docs/qa/`, `docs/releases/` | Dated provider evidence, superseded by native poll delivery |
| Expired September Together demo, catalog and tests | `docs/TOGETHER_QA_DEMO.md`, `scripts/seed-together-demo.ts`, `scripts/lib/`, `tests/v2/`, `e2e/api-together-demo.spec.ts` | September 9 fixture window expired; no active runtime imports or current command |
| Old public Discover showcase and account/chat demo seeders | `scripts/seed-discover-showcase.ts`, `scripts/seed-demo.ts`, `scripts/add-chat-planning-demo.ts` | Developer fixture tools for retired screens/sample accounts; no current runtime imports |
| Former roadmap | `docs/ROADMAP-2026-09-09.md` | Preserves dated rollout/test history and stale Build 34–40 instructions |

[MANIFEST.json](./MANIFEST.json) records each original path, Git source revision,
original SHA-256 and archived SHA-256. Markdown received a historical banner and
relative-link rebasing; source/test code and binary evidence retain their bytes.
Some old commands and absolute paths remain quoted in historical text. They have
no execution authority. The former npm Capacitor and Discover showcase commands
were removed from the active package scripts.

Retirement does not uninstall the supported ordinary SideSeat 97, delete user
data, remove migrations, or remove API/legacy UI dependencies still compiled or
served by the current backend. Those are listed as frozen compatibility in the
current inventory and stay at their original paths.
