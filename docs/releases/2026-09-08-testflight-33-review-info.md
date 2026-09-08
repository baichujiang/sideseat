# Build 33 — TestFlight review information

**Status:** Saved and submitted for external Beta App Review; Waiting for Review
as of `2026-09-08T00:49:26Z`.

The owner supplied the reviewer contact and requested reuse of the existing
test accounts. Both `test_001` and `test_002` authenticated successfully against
the production native login API, with completed onboarding and student
verification. The temporary verification sessions were revoked. No account was
created and no Plan or Outcome was changed. These `test_` accounts are excluded
from pilot measurements. Apple displayed Saved after the form was submitted.

## Public fields

- Feedback email: `valeridium@gmail.com`, verified on SideSeat's public support
  page on 2026-09-08.
- Marketing URL: `https://www.sideseat.de/`.
- Privacy policy URL: `https://www.sideseat.de/privacy`.
- Support reference: `https://www.sideseat.de/support`.
- The three public pages returned HTTP 200 during this check.
- Sign-in required: checked. Primary reviewer login: `test_001`; secondary QA
  account for bilateral inspection: `test_002`. The reviewer password was entered
  in Apple's sign-in field and is not reproduced in this document.
- Review contact name, phone and email: owner-provided and saved in Apple.
  Private contact details are not mirrored into this repository.

## Beta description — Simplified Chinese

SideSeat：让每一段校园时光，都有人同行。

SideSeat 帮助大学校园中的同学围绕具体活动和共同有空的时间，表达意向、获得同行机会，并把双方的意愿落实为计划。

本次 Beta 测试重点：

- 同行：添加本周想做的事，通过「选择活动 → 设置时间」两步流程编辑。返回上一步保留草稿；保存意向不会自动开始匹配。
- 消息与计划：双方同意同行后，在对话中协调活动，提出、接受或调整计划。确认的计划显示在双方日历中。
- 私密活动反馈：计划结束后，分别如实选择「发生了 / 没有发生 / 跳过」。回答仅自己可见，可修改；只有双方都选择「发生了」才生成共同经历。
- 界面体验：检查中文、浅色/深色、大字体下的卡片、弹出面板、日期控件和底部按钮。

请使用真实计划，不要为完成测试而编造活动结果，也不要与对方协调答案。可通过 App 内反馈入口或 TestFlight 报告问题。

## Beta review notes — English

Review access: the primary sign-in account is test_001. A second repository-owned QA account, test_002, is available for the two-participant flow and uses the same password as the primary account in the sign-in fields. Both accounts have completed onboarding and student verification. They are internal QA accounts, not real students, and are excluded from the non-QA pilot metrics.

SideSeat is a campus activity-coordination app. Sign-in is required.

Build 33 focuses on the Together and Plan flows. The four main tabs are Together, Calendar, Messages and Me.

Main flow: add a private weekly activity intent and available times in Together; saving an intent does not automatically start matching. Matching participation is explicit. When both participants agree to an opportunity, they can coordinate in Messages, propose or reschedule a Plan, and accept it. An accepted Plan appears in both participants' calendars.

After an accepted Plan ends, each participant may independently answer Occurred, Did not occur or Skip from the available history/follow-up surfaces. Answers remain private and can be edited. A Shared Encounter is derived only after both participants answer Occurred; no answer is inferred from silence.

Please inspect the two-step intent editor, draft preservation when navigating back, Plan response cards, native sheets and pinned submission controls. Light/Dark and Chinese UI are included in this build. Meet Again and repeat-opportunity features are not enabled in this Beta.

Do not use real students' accounts or fabricate real-event Outcome answers for review. Support: https://www.sideseat.de/support

Privacy policy: https://www.sideseat.de/privacy

## Next step

The owner authorized the follow-up: Build 33 was added to `SideSeat 用户测试`
and submitted to Apple. The group now contains one build and zero testers.
Automatic tester notification was deselected; no invitation was sent and no
public-link setting, production account, Plan or Outcome was changed.

After Apple approval, manually start external testing/notify testers and verify
that a consenting external participant can install Build 33 before wider
recruitment. Approval and external installation are not yet verified. The
Layer 2 non-QA Gate remains open; Layer 3 stays blocked.
