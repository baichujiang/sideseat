# Web password visibility — local preview, 2026-10-31

Source: `2c9c4facaaf3da7be362606973e9e7f2b463ab56` on
`codex/ios-uxui-20260922`.

The login, signup and account-security forms now share a password field with an
eye button. Passwords start hidden, each field switches independently, and form
reset restores hidden mode. Existing field names, autocomplete, required and
minimum-length rules remain intact. Explicit labels and 44px non-submit buttons
support keyboard and touch use. No password, authentication API, database or
native-app behavior was changed.

Verification: focused TypeScript, ESLint and whitespace checks passed. A read-only
independent React/accessibility review passed. Actual local browser checks cover
login/signup show and hide, a synthetic sample visibly retained across switching,
Space and Enter activation without submitting, all three account-security fields
switching independently, and a390px mobile layout with a44×44px button. No signup
or password-change request was submitted. The existing isolated local demo account
was signed out and signed back in to verify the real login page; its session was
restored. The user's activity draft and unrelated TypeScript edits were preserved.

Local preview: the existing verified3344 server in the active checkout, reused
without restart. No Vercel deployment or alias change, remote schema mutation or
native build/install was performed. Production remains the prior recorded
organizer-copy deployment. The forgotten-password compatibility page was not
changed in this focused `/web` fix.

Local captures: `/tmp/sideseat-password-eye-20261031/login-desktop.png`,
`login-mobile.png`, and `signup-mobile.png`. The captures contain no real password.
