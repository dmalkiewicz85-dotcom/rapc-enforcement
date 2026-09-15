# Google Setup — Sheets, Drive, Gmail, OAuth login

One Google Cloud project covers everything. Do the steps in order; each builds on the last.

## Why it's shaped this way

- **Everything runs as `rapchoa@gmail.com`.** Gmail cannot send "as" a consumer Gmail account from
  a service account (that needs Google Workspace domain-wide delegation), so outgoing mail must use
  an OAuth token issued to `rapchoa@gmail.com` itself. Once that token exists it can cover Sheets and
  Drive too, so the app needs exactly **one** stored credential: a refresh token for `rapchoa@gmail.com`.
- The Cloud project should be **owned by `rapchoa@gmail.com`**, not your personal account, so the
  Board can take it over without a migration. Create the Gmail account first (step 0).
- The same OAuth client is reused at go-live for user sign-in (step 5).

## Step 0 — Create the HOA Gmail account
1. https://accounts.google.com/signup → create `rapchoa@gmail.com`.
2. Turn on 2-Step Verification (Google requires it before some API features work).
3. Sign in to Chrome as this account for the rest of the steps (or use an incognito window) so
   nothing lands in your personal Google account.

## Step 1 — Create the Cloud project
1. https://console.cloud.google.com → project picker (top left) → **New Project**.
2. Name: `RAPC Enforcement`. Organization: *No organization*. **Create**, then select it.

## Step 2 — Enable the three APIs
**APIs & Services → Library**, search and **Enable** each:
- Google Sheets API
- Google Drive API
- Gmail API

## Step 3 — OAuth consent screen
**APIs & Services → OAuth consent screen** (Google may route you to "Google Auth Platform → Branding"; same thing).
1. User type: **External** (Internal is Workspace-only). **Create**.
2. App name: `RAPC Enforcement`. User support email: `rapchoa@gmail.com`. Developer contact: same. **Save**.
3. **Scopes** → *Add or remove scopes* → paste these into the manual box and **Add to table**:
   ```
   https://www.googleapis.com/auth/spreadsheets
   https://www.googleapis.com/auth/drive.file
   https://www.googleapis.com/auth/gmail.send
   openid
   https://www.googleapis.com/auth/userinfo.email
   https://www.googleapis.com/auth/userinfo.profile
   ```
   `drive.file` only sees files the app created — it cannot read the rest of the Drive.
4. **Test users** → add `rapchoa@gmail.com` and your own email.
5. **Publishing status: click "Publish app"** and confirm. This matters:
   while the app is in *Testing*, refresh tokens expire after 7 days and the app would silently stop
   sending notices. In *Production* they persist. You'll see a warning about verification — ignore
   it; verification is only needed for public apps. Users will see an "unverified app" screen once,
   at authorization time, with an *Advanced → Go to RAPC Enforcement* link. That's expected.

## Step 4 — OAuth client (web)
**APIs & Services → Credentials → Create Credentials → OAuth client ID**
1. Application type: **Web application**. Name: `RAPC Web`.
2. Authorized JavaScript origins:
   ```
   http://localhost:3000
   https://<your-vercel-project>.vercel.app
   ```
3. Authorized redirect URIs:
   ```
   http://localhost:3000/api/auth/callback/google
   https://<your-vercel-project>.vercel.app/api/auth/callback/google
   http://localhost:3000/api/google/callback
   https://<your-vercel-project>.vercel.app/api/google/callback
   ```
   The first pair is user sign-in (go-live). The second pair is the one-time authorization that
   produces the `rapchoa@gmail.com` refresh token. Add a custom domain later if you buy one.
4. **Create** → copy **Client ID** and **Client secret**. Put them in `.env.local` (never in chat, never
   committed):
   ```
   GOOGLE_CLIENT_ID=
   GOOGLE_CLIENT_SECRET=
   ```
   and add the same two in Vercel → Project → Settings → Environment Variables (all environments).

## Step 5 — Authorize `rapchoa@gmail.com` once (gets the refresh token)
This happens after the app scaffold exists — I'll provide `npm run google:authorize`. It opens a
browser; sign in as `rapchoa@gmail.com`, click through the unverified-app warning, grant the scopes,
and the script prints `GOOGLE_REFRESH_TOKEN=...` to paste into `.env.local` and Vercel.

If that token is ever revoked (password change, "remove access" in the Google account, or the
consent screen left in Testing), rerun the script. Nothing else changes.

## Step 6 — The spreadsheet and Drive folder
1. Signed in as `rapchoa@gmail.com`, create a Google Sheet named `RAPC Enforcement Data`.
   Leave it empty — the app creates and formats every tab on first run.
2. Copy the ID from the URL: `https://docs.google.com/spreadsheets/d/`**`<this part>`**`/edit`.
3. Create a Drive folder `RAPC Enforcement Letters`. Copy its ID the same way
   (`https://drive.google.com/drive/folders/`**`<id>`**).
4. Add to `.env.local` and Vercel:
   ```
   GOOGLE_SHEETS_ID=
   GOOGLE_DRIVE_FOLDER_ID=
   ```
No sharing step is needed — the app acts as `rapchoa@gmail.com`, who already owns both.

## Checklist
- [ ] `rapchoa@gmail.com` created, 2-step on
- [ ] Cloud project `RAPC Enforcement` owned by that account
- [ ] Sheets, Drive, Gmail APIs enabled
- [ ] Consent screen: External, 6 scopes, **Published**
- [ ] OAuth web client created, 4 redirect URIs, ID + secret in `.env.local` and Vercel
- [ ] Spreadsheet + Drive folder created, IDs in `.env.local` and Vercel
- [ ] (after scaffold) `npm run google:authorize` run, refresh token stored

## Final `.env.local` shape
```
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REFRESH_TOKEN=
GOOGLE_SHEETS_ID=
GOOGLE_DRIVE_FOLDER_ID=
HOA_ENFORCEMENT_EMAIL=rapchoa@gmail.com
NEXTAUTH_SECRET=          # generate with: openssl rand -base64 32 (only needed at go-live)
NEXTAUTH_URL=http://localhost:3000
```
