# To-Do — inputs needed from the HOA / owner

Items the app cannot proceed on without a decision or data. Nothing here is guessed in code.

## Accounts and access
1. **Create `rapchoa@gmail.com`** with 2-step verification. Everything in Google runs as this account.
2. **Google Cloud project** owned by that account — Sheets, Drive, Gmail APIs; consent screen
   published; OAuth web client. Full steps: [SETUP_GOOGLE.md](SETUP_GOOGLE.md).
3. **Spreadsheet + Drive folder** created as `rapchoa`, IDs into `.env.local` and Vercel.
4. Run `npm run google:authorize` → `GOOGLE_REFRESH_TOKEN` into `.env.local` and Vercel.
5. Run `npm run sheets:init` to create tabs and seed the nine rules.
6. Vercel env vars: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`,
   `GOOGLE_SHEETS_ID`, `GOOGLE_DRIVE_FOLDER_ID`, `HOA_ENFORCEMENT_EMAIL`.
7. **Go-live login.** Currently there is no sign-in; users pick themselves from an "Acting as"
   menu. Before go-live: add `NEXTAUTH_SECRET`/`NEXTAUTH_URL`, wire Google sign-in to the USERS
   tab, remove the picker.

## Data
8. ~~Sample HOA roster~~ **Received** — "CO-OWNER DIRECTORY as of 4-30-26" (.xlsx): two title rows,
   then `Unit Address | Unit/Lot # | Name | Phone | Email`. Board decisions (Sept 2026): Unit/Lot #
   is ignored; all listed emails are kept and notices go to every one; the unit address is the
   mailing address; owner name is stored verbatim. Still needed: **`HOA_SETTINGS.property_zip`**
   (the ZIP for the subdivision) so owner mailing addresses are complete for notices.
9. **Initial users** beyond Leslie Childress-Cooper (Board Admin): names, emails, roles.
   Leslie's email is blank in the seed — needed before login can match her.

## Spec open items A–I (verbatim from the spec; do not invent)
- A. Governing-document reference for each of the nine rules → `VIOLATION_RULES.governing_document/section`
- B. Exact governing-document text for each rule → `VIOLATION_RULES.governing_text`
- C. Board-approved corrective-action language per rule → `VIOLATION_RULES.corrective_action_text`
- D. Management company name, address, manager name/email → `HOA_SETTINGS`; optional
  `management_company_tagline` (the template prints "An Accredited Association Management
  Company®" under the response form — only printed if set)
- E. Manager signature and/or logo image → Drive, IDs into `HOA_SETTINGS`
- F. Property Management recipient email for PM reports → `HOA_SETTINGS.pm_report_recipient_email`
- G. Final-warning template — **decision (Sept 2026): one letter for all offense levels.**
  FINAL_WARNING renders on the standard notice layout with the fine box marked. The Board may
  later add offense-specific wording to the *email body* (`notice_email_body` — see H) or modify
  the letter; tracked here, not built. (The "Final Notice Before Collections" file received is a
  dues letter and is not used.)
- H. Approved email subject and body → `HOA_SETTINGS.notice_email_subject/body`. Placeholders
  available: {owner_name} {property_address} {rule_name} {offense} {action} {deadline} {fine}
  {case_number} {hoa_name}. Offense-specific verbiage can go here rather than in the letter.
- I. Extra placeholders found in the final-warning template (inspect in Phase 12)

## Approved letter text that conflicts with configuration (Board to resolve)
The standard notice is reproduced verbatim (spec: do not redesign). Two sentences in it disagree
with how the Board configured enforcement; the app prints them as written and puts the real
deadline in the action block above them:
- "**Within 14 days**, please email [ManagerEmail]…" — the configured deadlines are 7, 14, or 30
  days (or Board-set). Consider "Within the compliance period stated above".
- "…after violation closure, there may be a **12-month monitored period** in which another
  offense … will result in the violation being reopened and automatically progressed" — the
  Board set `reset_on_compliance=Y`, under which a new offense after closure is a first offense.
- The fine box lists Courtesy / $25 / $50 / $100; Noise carries $75 and $150. The app ticks the
  matching box or adds the actual amount as an extra checked line.
- The letter opens "This is a friendly reminder…" on every offense level. If second/third
  notices should read differently, that is the FINAL_WARNING template (item G).

All of these are seeded as `NEEDS_BOARD_INPUT` and the letter engine will refuse to generate a
notice while any required one is still a placeholder.

## Roles
- **ARC scope.** The spec says ARC members submit "ARC-related violations" but does not say
  which of the nine rules those are. Today ARC members can submit any rule. If the Board wants
  a restriction, name the rules and it becomes a column on VIOLATION_RULES.

## Rule details the Enforcement Guide leaves unstated
- Noise (RULE-001): no compliance deadline given for any step. Deadline will be required as an
  override on every noise notice until the Board sets `default_deadline_days`.
- Trash cans (RULE-003) step 3 and Noise step 4: "per occurrence" fines with no interval. Modelled
  as recurring with blank `recurrence_days`, meaning they are triggered by a new submission, not by
  the calendar. Set `recurrence_days` if the Board wants a calendar cadence.
- Landscaping/Exterior (RULE-002) and Recreational Structures (RULE-004) step 3: manual Board action
  (contractor/legal, 105% recovery). Flagged `manual_action_required=Y`; no cost calculation in v1.
- Noise: guide says 12-month offense window, Board says reset on compliance. Both stored
  (`offense_window_days=365`, `reset_on_compliance=Y`); reset wins while set to Y.
