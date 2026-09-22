# Build 39 automatic matching and flexible timing activation

## Authority and status

- On 2026-09-09, the owner explicitly requested enabling the new flow after
  the flags-OFF Build 39 release. Enable only `V2_AUTOMATIC_MATCHING_ENABLED`
  and `V2_FLEXIBLE_TIMING_ENABLED`; preserve other production settings.
- Activation complete: both flags are ON on production. The enabled candidate
  passed checks, was promoted and passed the same checks on the production API.
- This operation is not a new native upload, migration, QA reseed or public launch.
  No existing intention is silently published. Physical phone updates and signed
  two-account acceptance are not independently verified by this activation.

## Release inputs

- Code source: `503e8273a1407fab9007c05821b9c1d4ba2f4a2e`, exactly the backend
  and native source validated for [Build 39](./2026-09-09-testflight-39.md).
- Internal TestFlight: 1.0.0 (39), Apple build
  `a3b49969-e938-4f9a-bd9c-fdd052d91be1`, existing `SideSeat Internal` group.
- Database already has both additive migrations, 134 applied. No migration is
  run in this activation; builds explicitly use `SKIP_DATABASE_MIGRATIONS=1`.
- Vercel project `sideseat` (`prj_Mmv4C0ROdAmglCHaI41vrzTXiH2N`), team
  `baichus-projects`, target production, API `https://api.sideseat.de`.
- Flags-OFF rollback deployment: `dpl_BRvC7393JieuQp7WagtG9XtYD4Wp`.
- Isolated clean release checkout: `/private/tmp/sideseat-automatic-on.StbKRF`.
  Main workspace's unrelated Info.plist edit, archives and local video are excluded.

## User-visible behavior and next step

On Build 39, returning to the foreground reloads client configuration. Once ON,
the separate Start matching button and 48-hour session controls disappear.
New intentions use Publish intention, and timing may be undecided, a range or exact.
Previously saved legacy intentions still require the explicit
“查看并发布，自动寻找同行” action. Paused intentions remain paused until resumed.

Next: on both phones, confirm Build 39 and reopen the app; explicitly publish
compatible intentions, then verify private interest → mutual chat → explicit
timed Plan → acceptance → both Calendars. No fabricated Outcome answers or
real-user Gate claim. Existing 15 real local PostgreSQL tests and native UI
evidence remain in the feature documents; they are not new physical acceptance.

## Recovery

If rollback is required, set both production variables back to `0` and promote
the flags-OFF deployment above. Keep the additive schema; do not restore or
delete user intentions, messages, Plans or Outcome answers to roll back flags.

## Candidate verification

- Candidate: `dpl_Guxz1ysEPtH9yGr9TZRgtEjz3DqY`,
  `https://sideseat-945dfi3f9-baichus-projects.vercel.app`.
- Target: production, deployed with `--skip-domain`; source metadata confirms
  `503e827` with no dirty-source marker. Only these two rollout flags are overridden.
- Framework: Next.js 15.5.23. Build started at `2026-09-09T03:50:41.084Z` and
  was READY at `2026-09-09T03:53:17.209Z` (156.1 seconds including deployment).
- Both existing QA accounts passed candidate smoke at `2026-09-09T03:54:10.092Z`.
  Then both project Production variables were set to `1`, and the candidate was
  promoted. Production smoke passed at `2026-09-09T03:54:26.312Z`.
- Both endpoints report `v2AutomaticMatching=true` and `v2FlexibleTiming=true`;
  existing activity-fit, Together, Meet Again and production APNs remain enabled.
- Both accounts passed login, private Plan DTO, intention list, inbox and Calendar
  schedule reads. Each temporary smoke session was revoked. No opportunity match,
  intention publication, private decision, Plan or Outcome mutation was requested;
  normal intention-read expiry cleanup is not new publication.
- Public checks passed at `2026-09-09T03:54:27.691Z`: API/www AASA identity and
  share-link paths, plus HTTP 200 Privacy and Support pages. This does not claim
  physical Universal Link or push-delivery acceptance.
- Updated Build 39 Chinese testing notes to say the flow is enabled. App Store
  Connect displayed disabled **Saved**; existing internal group stayed unchanged.
  Browser-skill observe/update/verify workflow used the existing CUA connection.

## Post-deploy observability

- Error scan: initial deployment-scoped query since readiness returned no records.
- Drains: not inspected or changed in this flags-only operation.
- Monitoring: bounded activation smoke/error scan only; no new ongoing monitor
  or physical-device acceptance is claimed.

## Local evidence

- `/tmp/sideseat-automatic-on-deploy.log`
- `/tmp/sideseat-automatic-on-smoke.mjs`
- `/tmp/sideseat-automatic-on-{candidate-smoke,env-flexible,env-automatic,promote,production-smoke,public-smoke}.log`

## Updated internal testing notes

Build 39：自动寻找同行与弹性时间已开启。

请确认两台手机使用 1.0.0（39），切到后台再回到 App 以刷新配置。本次仅供内部测试。

1. “同行”不再需要单独点击开始匹配：发布活动意向即可自动寻找同行。
2. 已有旧意向不会自动发布。请点“查看并发布，自动寻找同行”，确认后发布；
   已暂停的意向需要主动恢复。暂停或结束会停止该意向继续参与。
3. 时间可以待商议、明天/周末/下周、日期范围或精确时间。
   时间未定不代表双方全天有空；匹配仍取决于是否存在符合条件的同行意向。
4. 用两个不同的 SideSeat 账号测试：发布兼容意向 → 有兴趣 →
   双方有兴趣后聊细节 → 发起并确认具体时间的计划 → 双方日历。
   单方兴趣保持私密，有兴趣不等于确认计划。
5. 检查消息、已有计划和日历仍正常；反馈中英德文、深色模式、大字体和滑条体验。

请记录问题步骤、截图和发生时间。QA 演示对象不会自动回答，
QA 验收不计入真实用户 Outcome pilot Gate。
