// One-time: obtain a refresh token for the HOA Google account.
//
//   npm run google:authorize
//
// Opens the consent URL; sign in as rapchoa@gmail.com. Google redirects back to
// http://localhost:3000/api/google/callback, which this script serves itself,
// so `next dev` must NOT be running on port 3000 at the same time.
//
// Prints GOOGLE_REFRESH_TOKEN=... — paste it into .env.local and Vercel. The
// token is never written to disk by this script.

import 'dotenv/config'
import http from 'node:http'
import { exec } from 'node:child_process'
import { google } from 'googleapis'
import { SCOPES } from '../lib/google.js'

const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = process.env
if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
  console.error('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.local first (docs/SETUP_GOOGLE.md step 4).')
  process.exit(1)
}

const REDIRECT = 'http://localhost:3000/api/google/callback'
const client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, REDIRECT)
const url = client.generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: SCOPES })

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, REDIRECT)
  if (u.pathname !== '/api/google/callback') { res.writeHead(404).end(); return }
  const code = u.searchParams.get('code')
  const err = u.searchParams.get('error')
  if (err || !code) {
    res.end(`Authorization failed: ${err ?? 'no code'}`)
    server.close(); process.exit(1)
  }
  try {
    const { tokens } = await client.getToken(code)
    client.setCredentials(tokens)
    const me = await google.oauth2({ version: 'v2', auth: client }).userinfo.get()
    res.end(`Authorized as ${me.data.email}. You can close this tab.`)
    console.log(`\nAuthorized as ${me.data.email}`)
    if (!tokens.refresh_token) {
      console.error('No refresh token returned. Remove the app under myaccount.google.com > Security > Third-party access, then rerun.')
    } else {
      console.log('\nAdd this to .env.local and to Vercel environment variables:\n')
      console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}\n`)
    }
  } catch (e) {
    res.end(`Token exchange failed: ${e.message}`)
    console.error(e)
  }
  server.close()
})

server.listen(3000, () => {
  console.log('Open this URL and sign in as the HOA account:\n\n' + url + '\n')
  const opener = process.platform === 'win32' ? 'start ""' : process.platform === 'darwin' ? 'open' : 'xdg-open'
  exec(`${opener} "${url}"`)
})
