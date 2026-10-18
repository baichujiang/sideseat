# AGENTS.md — Positive-First Development Protocol

## Active version and archive boundary — owner instruction 2026-10-15

- The active checkout is `/Users/baichu/Desktop/项目/app开发项目/Sideseat-ios-uxui`,
  branch `codex/ios-uxui-20260922`. Use this checkout explicitly. Do not switch to
  another Sideseat checkout, old chat working directory, release build directory
  or snapshot to infer the current product.
- Before editing, verify the repository root and working tree, fetch the remote,
  and preserve the current branch and unrelated work.
- Read `docs/DEPLOYED_STATE.md` before discussing or changing a deployed feature.
  Check installation, live deployment/flags, route reachability and visible labels;
  a source declaration or dated QA record alone does not prove a current entry.
- `archive/**` and `docs/archive/**` are frozen historical material. Do not edit,
  execute, build, deploy, restore or reuse their implementations/fixtures unless
  the owner explicitly requests recovery of that named archived feature. Do not
  fix archived code to satisfy current compilation, lint or tests.
- Retained compatibility surfaces listed in `docs/DEPLOYED_STATE.md` stay in place
  for existing clients/data and shared dependencies. Do not redesign, expose,
  reactivate, migrate or remove them as incidental cleanup. A direct owner request
  for that compatibility surface is required before changing it.
- Preview 122 is the current installed development build; see
  `docs/DEPLOYED_STATE.md` for verification status. Ordinary SideSeat/TestFlight 97
  is a separate supported older client. Do not uninstall it or drop its API/data
  compatibility as part of archival work.
- The deployed backend contains preserved production differences from this Git
  snapshot. Use the recorded comparison before a future release; never replace
  production with the entire local checkout on the assumption that they match.
- Keep dated release and QA verdicts as evidence. Add new verification records;
  do not promote old screenshots, disabled flags or proposed designs to deployed
  functionality. The owner approved manual unified planning (time collection →
  invitation → individual confirmation → Calendar) on 2026-10-15; see
  `docs/UNIFIED_PLANS.md`. Discovery Pod and archived group routes stay frozen.

## Owner delivery rule — 2026-10-03

The owner requires every completed modification stage to be traceable in Git and
available in the phone Preview, rather than accumulating local-only changes.

- After relevant verification, make a focused commit for each completed stage and
  push the current branch to GitHub. Include related tests and documentation.
- Update the native phone Preview for user-visible app changes. Release required
  backend dependencies through the documented release procedure before installing
  a client that depends on them. This standing instruction does not authorize
  App Store submission or TestFlight distribution.
- Record the commit SHA, Preview build number, relevant backend deployment ID,
  and actual install/launch verification in `docs/releases/`. Distinguish committed,
  pushed, backend deployed, and device installed; never use “done” for all four
  when only local implementation has finished.
- Keep unrelated unfinished work and credentials out of a stage's commit. Preserve
  the current branch and other local edits. Historical catch-up commits must say
  they capture an existing release/snapshot, without inventing past commit dates.

## Core Philosophy

This repository follows a **Positive-First, Execution-First** development philosophy.

Prioritize:

1. Correct working end-to-end behavior.
2. Real execution and integration.
3. Simple, direct implementation.
4. Fixing concrete observed problems.
5. Evidence-driven robustness.

The default question is:

> “How do we make the intended behavior work?”

not:

> “How many ways could this theoretically fail?”

---

## 1. Build the Primary Path First

Implement the simplest complete version of the requested behavior.

Prefer:

```text
intent
→ implementation
→ integration
→ run
→ observe
→ fix concrete problems
```

Do not begin with:

* exhaustive edge-case analysis
* speculative validation
* large failure-handling matrices
* generalized error frameworks
* compatibility layers
* premature abstractions
* extensive negative tests
* future-proofing

Get the intended flow working first.

---

## 2. Prefer Execution Over Speculation

If a question can be answered cheaply by running the code, run it.

Prefer:

```text
run
→ observe
→ understand
→ fix
```

over:

```text
imagine
→ speculate
→ defend
→ add complexity
→ eventually run
```

Runtime evidence outranks hypothetical reasoning.

Do not recursively invent failure cases for hypothetical failure cases.

---

## 3. Complexity Must Earn Its Place

The burden of proof is on adding complexity, not omitting it.

Do not add guards, retries, fallbacks, wrappers, abstractions, compatibility code, generalized validation, or configuration merely because they might someday be useful.

Add them when justified by concrete evidence such as:

* explicit requirements
* actual external contracts
* observed failures
* known regressions
* realistic operating conditions
* security boundaries
* meaningful data-loss risks

If there is no concrete reason, prefer the simpler implementation.

---

## 4. Validate at Real Boundaries

Validation is most useful at trust boundaries such as:

* user input
* HTTP/API input
* filesystem input
* network responses
* databases
* third-party services
* authentication/authorization
* deserialization
* irreversible operations

Prefer:

```text
validate once
→ establish invariant
→ trust invariant internally
```

Do not repeatedly validate the same invariant throughout trusted internal code.

Internal functions do not need to defend against every imaginable misuse.

---

## 5. Avoid Speculative Defensive Programming

Do not automatically:

* wrap every operation in `try/catch`
* add retries to every network operation
* create fallback behavior without a requirement
* silently swallow errors
* fabricate default or fake-success data
* support callers that do not exist
* build abstractions for hypothetical future requirements
* add configuration for behavior that currently has one requirement
* refactor unrelated working code
* create infrastructure “while we are here”

Prefer clear failures over speculative recovery when correct continuation is impossible.

Observability is encouraged.

Hidden failure is not.

---

## 6. Keep Implementations Direct

Prefer narrow, understandable code over generalized architecture.

Temporary duplication is acceptable when abstraction would slow down or obscure the primary implementation.

Prefer:

```text
real repetition
→ obvious common concept
→ abstraction
```

over:

```text
possible future repetition
→ speculative abstraction
```

Do not build a framework when a function is sufficient.

Do not modify code for hypothetical future callers.

Future requirements can justify future changes.

---

## 7. Testing Priorities

Testing priority is:

1. Main success path.
2. Important alternate success paths.
3. Real integration behavior.
4. Known regressions.
5. Realistic boundaries.
6. Explicitly required failures.
7. Additional negative cases only when justified.

Do not generate negative tests simply because more invalid inputs can be imagined.

Do not optimize for test count or coverage percentage.

Tests should protect meaningful behavior.

Prefer real execution paths over excessive mocking.

Do not complicate production architecture solely to make speculative tests easier to write.

---

## 8. Evidence-Driven Hardening

Hardening should follow evidence.

Prefer:

```text
observed problem
→ understand cause
→ targeted protection
```

over:

```text
imagined problem
→ broad defensive framework
```

Useful evidence includes:

* runtime failures
* failing tests
* logs
* production incidents
* user reports
* API documentation
* reproduced bugs
* security requirements
* actual integration behavior

Add robustness progressively as reality demonstrates the need.

---

## 9. Deferral Is Allowed

Not every foreseeable issue must be solved during initial implementation.

Non-blocking robustness concerns may be deferred to later:

* testing
* review
* QA
* hardening
* follow-up work

Recognizing a possible problem does not create an obligation to solve it immediately.

Prefer deferral when solving the concern now would add complexity without helping the intended behavior succeed.

Deferral means:

> not now

not:

> never

Concrete problems discovered later should be fixed normally.

---

## 10. Keep Scope Focused

When asked to implement feature X, implement feature X.

Do not automatically expand the task into:

* architecture redesign
* security audits
* dependency replacement
* generalized infrastructure
* repository-wide refactoring
* speculative scalability work
* unrelated cleanup
* future-proofing

Adjacent changes are appropriate only when necessary for the requested behavior.

---

## 11. Security and Data Safety

Positive-first development does not override concrete security or data-safety requirements.

Address obvious high-impact risks involving:

* authentication
* authorization
* secret exposure
* injection
* destructive operations
* irreversible data loss
* unsafe migrations
* corrupted persistent state
* untrusted code execution

Security work should remain proportional to the actual threat model.

Do not use “security” as justification for unlimited speculative complexity.

---

## 12. Completion and Stop Rule

A task is normally complete when:

* the requested behavior is implemented
* the primary flow works
* relevant integration works
* relevant existing tests pass
* meaningful positive verification succeeds
* no known blocking defect remains
* required contracts are respected

Completion does not require exhaustive hardening or handling every imaginable invalid state.

Once these conditions are satisfied:

> **STOP.**

Do not invent additional work.

Do not automatically add more:

* validation
* edge-case handling
* abstractions
* refactoring
* compatibility code
* tests
* configuration
* infrastructure
* future-proofing

A completed task is allowed to remain complete.

---

## Default Decision Bias

When uncertain:

```text
simple implementation
>
speculative defensive implementation
```

```text
run the code
>
reason about hypothetical failures
```

```text
finish the requested feature
>
improve surrounding infrastructure
```

```text
defer optional hardening
>
add complexity just in case
```

```text
working real behavior
>
theoretical completeness
```

---

## Final Directive

**Build forward.**

Implement the intended behavior first.

Run real code early.

Prefer execution over speculation.

Trust established invariants.

Validate at real boundaries.

Keep implementations direct.

Do not solve imaginary problems.

Let evidence drive hardening.

Defer non-essential robustness.

Require complexity to justify itself.

When the requested behavior works and relevant verification succeeds:

**STOP.**
