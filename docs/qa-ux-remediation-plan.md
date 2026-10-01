# Live QA remediation plan

Source: the 30 September 2026 authenticated product walkthrough and its 150 desktop/mobile screenshots.

## 1. Make creation reliable in Chat

- Keep the Chat creation panel, close control, tabs, and composer usable at 320 px and 390 px.
- Make the default Posts & Drafts view show newly saved drafts.
- Recover from stale client chunks by reloading the app from the error boundary.
- Replace internal rate-limit codes with actionable plain language.
- Describe the current video path accurately as branding/editing an uploaded MP4, and show a useful video preview when resuming a draft.
- Open an editable dated draft from Calendar; offer a readable mobile agenda view.

## 2. Make Theme Studio a usable creative library

- Reflow the five-step wizard, page navigation, sample carousel, and template editor on narrow screens.
- Remove false verification language from example content.
- Give templates visible previews and a direct Use in Chat action.
- Preserve templates as usable standalone work after a Theme Page is deleted, with working editor and delete controls.

## 3. Prevent incomplete automation

- Validate flow graph structure and required credentials/destinations on the server before activation, then show missing setup beside the action.
- Provide a legible mobile Flow editor path with Validate before Activate.
- Disable Scout scans when required setup is missing and explain how to complete it.

## 4. Simplify supporting screens

- Reflow Analytics, Assets, and Engagement controls at 320 px.
- Lead Accounts and Brand Kit with the user's next action; reduce duplicated or advanced setup language in Settings.

## Acceptance and release

1. Run lint, typecheck, focused tests, and the repository's end-to-end smoke suite.
2. Test the changed flows in a browser at 1440, 390, and 320 px; capture screenshots and verify no hidden primary actions or page overflow.
3. Commit and push one `codex/qa-ux-remediation` branch, open one PR, and wait for Macroscope code review. Address actionable findings and repeat affected checks.
4. Merge only after review and required checks pass. Run a fresh end-to-end pass after the merge and record any integration-only limitation.
