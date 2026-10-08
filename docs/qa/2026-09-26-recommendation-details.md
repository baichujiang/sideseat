# Recommendation detail parity

Recommendation cards now include the peer's school, primary language, intention course and public exploration description when present. The avatar, activity, declared timing and bottom Interested / Say hello buttons remain. Missing fields are omitted. The API returns the peer's course rather than the pair's shared course, and the peer's language independently of shared languages. Description previews use the same 96-character limit as exploration and are only returned for exploration-visible intentions; private notes remain hidden. New wire fields are optional for older clients and responses. OpenAPI and generated Swift types were updated. No database migration is needed.

Validation:

- TypeScript check, OpenAPI contract check and Development simulator build passed.
- Eight backend tests passed, including real local PostgreSQL checks for peer-only course/language, reversed viewer perspective, public preview truncation, and private-note omission.
- Bookmark/send and exploration-to-saved UI flows passed in `/tmp/sideseat-peer-details-ui.xcresult`.
- The large-text check initially selected the wrong retained scroll container. Its helper now targets the active recommendations page, and the rerun passed in `/tmp/sideseat-peer-details-large.xcresult`.
- Chinese normal-size and German dark accessibility-size screenshots were inspected: `docs/visual-qa/opportunity-bookmark-message-zh.png` and `docs/visual-qa/opportunity-bookmark-message-large-de.png`.

Local fixture preview only; backend and app changes have not been deployed.
