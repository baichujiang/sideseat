# All-activity intention regression — 2026-09-24

## Scope

The intention editor is one scrollable form: activity, details, study preferences/course, timing and note, with one persistent save action. There is no Next/Back step. See `2026-09-24-one-page-intention.md` for the initial implementation and keyboard-layout verification.

Regression runs use Xcode 26.6, the iOS 26.5 iPhone 17 Pro simulator `SideSeat UX QA` (`AEBD816E-53A7-4012-B76A-FEF82CF02A6B`) on branch `codex/ios-uxui-20260922`. UI journeys use local fixtures, ephemeral credentials and `http://127.0.0.1:9`; they do not verify live backend persistence or publish a TestFlight build.

## Outcome

All 379 unit tests and all 11 selected UI tests have passed on the final production code, including all six activity lifecycles. There are no unresolved failures in this selected regression. The broad final run passed 389 tests; its remaining study-test navigation failure was corrected in the test only and passed in a separate rerun. The final app build and `git diff --check` also passed.

## Activity coverage

Every category has its own UI test. Each creates an intention, edits its description and note, refreshes and reopens it, checks the undecided timing preference, pauses it, saves while paused, resumes it, and ends it.

| Category | Created description | Edited description | Additional coverage |
| --- | --- | --- | --- |
| Coffee | Coffee after class | Coffee on campus | General activity text |
| Study | Review calculus | Prepare algebra exam | Parallel study mode, optional course selection and course display on the card |
| Sports | Cycling | Pickleball | Known sport to custom sport; scrolling dismisses the keyboard |
| Explore | Visit a museum | Walk around the old town | General activity text |
| Food | Lunch at the canteen | Dinner near campus | General activity text |
| Events | Go to a concert | Visit a campus festival | General activity text |

Shared regression also covers empty/over-limit inputs, scrolling without losing input, saving once without another finding confirmation, returning from Explore to the newly created intention, emoji boundaries, and German at the largest accessibility text size in dark appearance.

## Fixes

- Local study saves retained the course ID but omitted the course object needed by the card. The preview store now resolves that object from the same course fixtures used by the picker, retaining it through edits and pause/resume. The study journey checks the displayed course after creation and after resuming.
- Native text limits counted Swift graphemes while `lib/validators/weekly-intent.ts` enforces JavaScript UTF-16 lengths. For example, 41 book emoji counted as 41 in the editor but 82 against the API's 80-unit title limit. Activity descriptions, study goals, custom sports and notes now validate the trimmed text with the API's counting rule. Parameterized unit coverage checks 60/80/160 boundaries with emoji and Chinese text; a UI journey rejects 41 emoji, accepts 40, saves, and verifies the reopened title.
- Starting a form scroll now dismisses the keyboard immediately, keeping the remaining fields accessible without a separate dismissal step.

## Test navigation

Editing prefilled text now uses the system Select All menu. Deleting a fixed number of characters was incorrect when the caret opened at the beginning; a hardware-key shortcut was inconsistent. The system menu follows the simulator language independently of the app language, so the helper supports the English, Chinese and German menu labels.

When the keyboard is visible, the reveal helper uses a normal form swipe before precise positioning. Press-and-drag gestures repeatedly failed to leave the single-line sport field's editing interaction, including when moved away from the screen edge. With the keyboard hidden, the existing adaptive drag and visible-viewport bounds still avoid overshooting fields at large text sizes. Text retention, save, length and layout assertions remain intact.

## Run record

- `sideseat-all-activities-20260924-first.xcresult`: no tests executed. Explicit enumeration confirmed the new test identifiers before retrying; this is not a passing run.
- `sideseat-all-activities-20260924-run2.xcresult`: interrupted after detecting incorrect caret replacement in the new test. Xcode could not finalize the interrupted bundle.
- `sideseat-all-activities-20260924-smoke.xcresult` and `sideseat-all-activities-20260924-study-edit.xcresult`: exposed the text-replacement shortcut and system-menu-language issues above.
- `sideseat-all-activities-20260924-regression.xcresult`: 386 passed, 1 failed. All 378 original unit tests, five category lifecycles, and three shared UI journeys passed. Sports failed when the press-and-drag helper could not reach the note.
- `sideseat-all-activities-20260924-fixes.xcresult`: 380 passed, 1 failed. All 379 unit tests and the emoji UI journey passed; sports still hit the gesture problem. Restricting automatic focus scrolling to a shrinking viewport did not resolve it, and that attempted production change was removed.
- The `sports-scroll`, `sports-dismiss`, and `sports-verified` intermediate bundles remained failures. They distinguished a successful ordinary swipe from the failing press-and-drag navigation; none is counted as completed verification.
- `/tmp/sideseat-all-activities-20260924-final.xcresult`: 389 passed, 1 failed, 0 skipped. This includes all 379 unit tests and 10 UI tests. The only failure was study-test navigation after keyboard dismissal scrolled past the offscreen study-mode control. The test now verifies mode/course before editing the goal and explicitly scrolls upward when returning to that earlier input. Production code was unchanged after this run.
- `/tmp/sideseat-all-activities-20260924-study-verified.xcresult`: the remaining study lifecycle passed, 0 failed, 0 skipped. Its checks still cover goal/note edits, selected mode/course, course display, refresh, undecided timing, pause/save/resume and ending.

Screenshots are written under the ignored `docs/visual-qa/` directory as `one-page-<category>-edited-and-resumed.png`, with keyboard and large-text screenshots from the shared regression.

After verification, the updated app was relaunched on the same simulator in Chinese, light appearance and normal text size, using empty local intention fixtures, flexible timing, automatic matching, ephemeral credentials and the loopback API override.


## Follow-up: contextual Add intention entry

The Together navigation-bar Add action has been removed. My intentions now has one creation entry per state: the existing primary empty-state action when empty, or a neutral “＋ Add an intention” button below the list heading when populated. Recommendations and Explore have no creation entry. The Chinese label is shortened to “添加意愿”. Both entry states still open the one-page editor; saving keeps the user in My intentions and reveals the new card.

The empty-state accessibility container now explicitly contains its children so that its own identifier does not replace the button identifier. The list button uses the existing shared secondary-button styling and supports wrapping at accessibility text sizes.

Verification on SideSeat UX QA (iPhone 17 Pro, iOS 26.5), with ephemeral credentials and loopback-only API fixtures:

- Development build-for-testing passed.
- `/tmp/sideseat-contextual-add-20260924.xcresult` was interrupted after exposing the empty-state identifier inheritance issue and a stale installed test runner. The container was corrected and the QA simulator's test runner reinstalled.
- `/tmp/sideseat-contextual-add-20260924-verified.xcresult`: 4 passed, 1 failed. Passed: largest-text editor journey, two consecutive study creations with refresh, creation from the populated list with no Explore publishing, and empty-state creation/cancel/navigation. The dark-layout check passed in English but its full-swipe navigation repeatedly overshot the Add button in German at the largest text size.
- The UI-test reveal helper now uses its existing short, position-aware drag for known list controls too. Production code was unchanged after the four passing checks.
- `/tmp/sideseat-contextual-add-20260924-dark-verified.xcresult`: 1 passed, 0 failed, 0 skipped. English dark and German largest-text dark layouts both passed, including opening and cancelling the editor from the moved button and reaching the existing edit and Explore actions.

All five selected UI journeys ultimately passed. Screenshots inspected: `together-add-in-list-zh.png`, `together-add-empty-zh.png`, `together-add-in-list-en-dark.png`, `together-add-in-list-de-dark.png`, and `together-add-empty-de-large-type.png` under ignored `docs/visual-qa/`.


## Later editor simplification

The activity grid and category-specific input sections have since been replaced by a compact menu and shared description/time form. See [compact intention form regression](2026-09-24-compact-intention-form.md) for the superseding editor behavior and verification. Earlier course/note/editor screenshots in this document describe the previous form.
