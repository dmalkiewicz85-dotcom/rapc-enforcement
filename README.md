# RAPC Enforcement

HOA rules-enforcement case management for the Reserves at Park Creek. See `CLAUDE.md` for
architecture and `docs/SETUP_GOOGLE.md` to connect the Google account.

```bash
npm install
cp .env.example .env.local   # fill in per docs/SETUP_GOOGLE.md
npm run google:authorize
npm run sheets:init
npm run dev
```
