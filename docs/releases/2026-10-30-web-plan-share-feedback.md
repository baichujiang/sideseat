# Web plan sharing verification — 2026-10-30

Source `6ab9c31f04fd27229bda5619582a6197da38acbb`, candidate `dpl_CMe4xfC4BF3suaQFbfHJAhaFzREx`.

Actual local and production Mac in-app browser runs used two dedicated accounts with an accepted contact link. The exact copied URL matched the clipboard and opened the public plan; the recipient opened the web workspace, submitted availability, received a chat card, and opened the same plan from it. API readback showed one recipient message and one plan. Physical iPhone and Safari were not tested.

A repeated share returned zero deliveries while the page claimed that it sent a message. The web UI now reports already shared contacts accurately, including partial deliveries. Share/copy errors are displayed within the dialog with a retry action. Local UI verified first-send feedback, repeated-share feedback, a stale-version error inside the dialog, and retry. No API/business rule or native changes.

The deployment source was built from 1,429 verified baseline files, with one web overlay and one provenance marker; all 1,430 uploaded source hashes match. Focused ESLint passed.

The candidate built READY; protected candidate login returned HTTP 200. The exact build was promoted without rebuilding, and root/www/api aliases all resolve to it. On the live build, repeat sharing reports that the contact already received it; the original chat message remains exactly one. A new plan was shared successfully and its recipient received one new message. Local and production QA accounts were deleted and their old cookies returned 401.
