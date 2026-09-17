# RAPC Enforcement

## What This Is
Rules-enforcement case management for the **Reserves at Park Creek HOA** (Canton Township, MI).
Board, ARC, and Property Management users submit violations against properties; a configurable
rules engine determines the offense level, action, deadline, and fine; the Board approves; the
app generates a two-page notice PDF, files it in Drive, and emails it from the HOA Gmail account;
the case is tracked to compliance, with recurring fines and a Property Management fine report.

**Not** a collection of forms that mail letters. It is a case-management system whose every
determination is traceable to a configured rule (spec, PRIMARY ARCHITECTURAL PRINCIPLE).

The authoritative requirements are in `docs/RESERVES AT PARK CREEK RULES ENFORCEMENT SYSTEM.docx`
(v1.0). Read the relevant section before feature work. Source-of-truth hierarchy: governing
documents → Enforcement Guide → Board-approved configuration in the sheet → approved letter
templates → this code. **Never invent governing-document text, penalties, deadlines, or legal
language.** Unknowns are seeded as `NEEDS_BOARD_INPUT` and tracked in `docs/TODO.md`.

## Tech Stack
- **Next.js 15 (App Router) + React 19**, Tailwind 3, lucide-react. JavaScript, ESM, no TypeScript.
- **Data: one Google Sheet** (`GOOGLE_SHEETS_ID`), one tab per entity. The owner chose Sheets over
  a database knowingly (the spec recommends Postgres); the app is the only writer.
- **Google APIs** (Sheets, Drive, Gmail) via `googleapis`, all acting as `rapchoa@gmail.com`
  through a single OAuth refresh token. Setup: `docs/SETUP_GOOGLE.md`.
- **Hosting:** Vercel — https://vercel.com/dmalkiewicz85-dotcoms-projects/rapc-enforcement
  `main` = production, `dev` = preview.
- **Repo:** https://github.com/dmalkiewicz85-dotcom/rapc-enforcement

## Structure
```
app/                 Next.js routes. Server components read via lib/*, never call Google directly
  api/health         config check      api/acting-as   pre-go-live user picker
  api/roster         POST multipart file, mode=preview|apply (Board Admin only)
  page.jsx           dashboard          violations/ properties/ approvals/ fines/ admin/
components/          Sidebar (role-filtered nav), ActingAs
lib/
  schema.js          TABS: every sheet tab + exact headers; enums; PERMISSIONS + can()
  seed.js            nine rules and their steps, first user, HOA settings — written once by sheets:init
  rules-engine.js    determineEnforcement, nextRecurringFineDue, daysOverdue — pure, tested
  sheets.js          readTab/readTabs/appendRow/updateRow/writeSteps/readSettings
  google.js          OAuth client + sheetsApi/driveApi/gmailApi; googleConfigStatus()
  ids.js             newId, nextCaseNumber (VIO-YYYY-NNNN), normalizeAddress
  time.js            America/Detroit date helpers; store UTC ISO, display Eastern
  current-user.js    cookie-backed "acting as" until sign-in exists
  dashboard.js       loadDashboard + deriveDashboard
  roster.js          parseRoster + planRosterImport — pure, tested
  roster-import.js   xlsx → previewRoster / applyRoster (writeSteps)
  properties.js      loadProperties / loadProperty joined with owners, ownerships, cases
scripts/
  google-authorize.mjs   one-time refresh-token flow
  init-sheets.mjs        create tabs, verify headers, seed empty config tabs
docs/                spec .docx, letter templates, SETUP_GOOGLE.md, TODO.md
```

## Architecture Rules

### Secrets stay on the server
`GOOGLE_*` env vars are read only inside `lib/google.js`, from server components, route handlers,
and scripts. Never `NEXT_PUBLIC_`-prefix them; never import `lib/google.js` or `lib/sheets.js`
from a `'use client'` component.

### Header titles are the API contract
`lib/schema.js` `TABS` lists every tab's headers. Rows are read/written as objects keyed by
those titles, resolved to columns at request time, so the Board may reorder columns but not
rename them. `readTab` throws if a required header is missing. Adding a column: add it to
`TABS`, rerun `npm run sheets:init` (it only appends headers to new tabs — add the column to
an existing tab by hand), then use it.

### Rows are found by `id`, never by position
`updateRow` re-reads the tab and locates the row by its `id` at write time. Someone sorting the
sheet must never corrupt a write.

### No transactions — use `writeSteps`
A Board approval touches ENFORCEMENT_EVENTS, NOTICES, FINES, and AUDIT_LOG. Wrap sequences in
`writeSteps([[name, fn], ...])` so a failure reports `completedSteps`; the route returns that
instead of a bare 500 and the caller reconciles. Retries for 429/5xx live in `sheets.js`.

### Configuration is data, not code
Fines, deadlines, steps, recurrence, approval requirements, governing text, letter language,
management-company details all live in `VIOLATION_RULES`, `RULE_ENFORCEMENT_STEPS`, and
`HOA_SETTINGS`. `lib/seed.js` is written **once** into empty tabs; after that the sheet wins.
Code must never hardcode a dollar amount or a day count.

### The rules engine is pure
`lib/rules-engine.js` takes rows and returns a determination with a `basis` string explaining
how the offense was calculated — that string goes into the audit log. Board members never
select the offense level. Key behaviours (all under test):
- Confirmed compliance closes the case and **resets** the count when `reset_on_compliance=Y`.
- An open case progresses to the step after the highest APPROVED event.
- Past the last step, a recurring last step repeats; otherwise it's manual Board action.
- History is scoped to **one ownership** — a new owner starts at zero.
- Deadline = notice date + step days (falls back to rule default); `null` means the UI must
  demand an override with a reason.
- Recurring fines schedule only when `recurrence_days` is set and no fine is already pending.

### Every enforcement action needs Board approval before anything leaves the building
No email is sent on submission. Events are created `PENDING_BOARD_APPROVAL`; approval
generates the PDF → Drive → Gmail → NOTICES row with message id. Recurring fines also enter
pending. Owner with no email → `MANUAL_DELIVERY_REQUIRED`. Gmail failure → `EMAIL_FAILED` +
retry, never a duplicate event or fine.

### Snapshots are immutable
VIOLATIONS stores `owner_*_snapshot` at creation. Historical notices render from the snapshot,
never from the current roster. Nothing in enforcement history is ever deleted; roster imports
end ownerships and close their open cases but preserve every row. On an ownership change the
old owner's pending events are CANCELLED and fines not yet sent to PM are WAIVED (Board decision,
Sept 2026) so the new owner never receives a notice or fine for the previous owner's conduct;
fines already SENT_TO_PM/ASSESSED are left as the old owner's.

### Permissions are checked twice
`can(user, action, settings)` in `lib/schema.js` gates both the UI (hide the button) and the
route handler (reject the request). Adding a rule in only one place is a bug. ARC fine approval
is off unless `HOA_SETTINGS.arc_may_approve_fines = Y`.

### Time
Store ISO UTC timestamps and `YYYY-MM-DD` dates; display Eastern via `lib/time.js`. Use
`todayISO()` (Detroit calendar date), never `new Date().toISOString().slice(0,10)`.

## Commands
```bash
npm install
npm run dev              # http://localhost:3000 — needs .env.local (see .env.example)
npm run lint             # next lint, zero warnings
npm test                 # node --test lib/**/*.test.js, no network
npm run build
npm run google:authorize # one-time refresh token (stop `next dev` first — uses port 3000)
npm run sheets:init      # create/verify tabs, seed empty config
```

## Deployment
Push `dev` → Vercel preview; merge to `main` → production. Env vars listed in `docs/TODO.md` #6
must be set for Production, Preview, and Development.

## Build phases (spec BUILD SEQUENCE)
1 ✅ schema, roles, acting-as · 2 ✅ roster import + ownership · 3 ✅ rules config + engine ·
4 violation submission + dashboard (dashboard ✅) · 5 approval workflow · 6 warning PDF ·
7 Drive · 8 Gmail · 9 compliance + recurring fines · 10 PM reporting · 11 audit/security/tests ·
12 final-warning template. Inspect `docs/templates/*.pdf` and map every field before Phase 6.
