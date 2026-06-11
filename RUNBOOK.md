# JackDAW Release Runbook

## Overview

JackDAW deploys to Firebase Hosting (`jackdaw-e862a`) automatically on merge to `main`.
This runbook covers manual releases, rollbacks, environment setup, and health checks.

---

## Pre-Release Checklist

```
[ ] All tests pass locally:      npm run test
[ ] Lint clean:                  npm run lint
[ ] TypeScript builds:           npm run build
[ ] No open P0/P1 beads issues:  bd list --priority=0 --status=open
[ ] firestore.rules reviewed for any permission changes
[ ] .env.example up to date with any new VITE_ vars
```

---

## Required Environment Variables

Set these as GitHub Actions secrets and (for local Firebase testing) in `.env.local`.

| Variable | Where to get it | Required for |
|---|---|---|
| `VITE_STORAGE_MODE` | Set to `firebase` in CI, `local` in dev | Storage backend selection |
| `VITE_APP_VERSION` | Auto-set in CI via `package.json` + git SHA | Version display |
| `VITE_SUPABASE_URL` | Supabase project settings → API | Audio file uploads |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase project settings → API | Audio file uploads |
| `VITE_R2_WORKER_URL` | Cloudflare Workers dashboard | R2 audio storage proxy |
| `FIREBASE_SERVICE_ACCOUNT_JACKDAW_E862A` | Firebase Console → Service Accounts → JSON key | CI deploy |

CI reads all of the above from GitHub Secrets (Settings → Secrets and variables → Actions).

---

## Deploy (Normal Path)

1. Merge a PR to `main` — GitHub Actions handles the rest.
2. The `firebase-hosting-merge.yml` workflow runs lint → test → build → deploy.
3. Verify at: https://jackdaw-e862a.web.app

---

## Manual Deploy (Emergency)

If CI is broken and you need to deploy immediately:

```bash
npm ci
npm run lint && npm run test     # must pass
export VITE_STORAGE_MODE=firebase
export VITE_APP_VERSION=$(node -p "require('./package.json').version")+manual
export VITE_SUPABASE_URL=<value>
export VITE_SUPABASE_PUBLISHABLE_KEY=<value>
export VITE_R2_WORKER_URL=<value>
npm run build
npx firebase deploy --only hosting --project jackdaw-e862a
```

---

## Rollback

Firebase Hosting keeps a history of deployments.

**Via console:**
1. Firebase Console → Hosting → jackdaw-e862a → Release history
2. Click the target release → "Rollback to this version"

**Via CLI:**
```bash
# List recent releases
npx firebase hosting:releases:list --project jackdaw-e862a

# Roll back to a specific release ID
npx firebase hosting:rollback --project jackdaw-e862a
```

---

## Firestore Rules Deploy

Rules are **not** deployed automatically with the hosting deploy.

```bash
npx firebase deploy --only firestore:rules --project jackdaw-e862a
```

After a rules change, verify in Firebase Console → Firestore → Rules → Rules Playground.

---

## Post-Deploy Health Checks

```
[ ] App loads at https://jackdaw-e862a.web.app
[ ] Sign in with magic link works (check email delivery)
[ ] Create a project, create a song, add a track — all persist after reload
[ ] Collaboration: invite a second account, verify it can edit
[ ] Export mixdown produces a valid WAV
[ ] Console shows no uncaught errors
```

---

## Firebase Project Details

| Property | Value |
|---|---|
| Project ID | `jackdaw-e862a` |
| Hosting URL | https://jackdaw-e862a.web.app |
| Firestore region | `nam5` (us-central) |
| Auth providers | Email (magic link), Anonymous |

---

## Known Issues & Workarounds

- **`updateDoc` on missing doc**: Use `setDoc(..., { merge: true })` — Firestore `updateDoc` fails if the document doesn't exist.
- **Firestore rules timestamp check**: `request.time.toMillis()` exact-match against `Date.now()` fails due to clock skew — rules use a ±30s tolerance.
- **IDB v1→v2 migration**: Songs were keyed by composite `projectId/songId`; the upgrade handler moves them automatically. If a user's IDB is stuck, clearing site data in DevTools resolves it.
- **AudioContext autoplay policy**: Always call `await ctx.resume()` before scheduling sources. The shared singleton handles this in `sharedAudioContext.ts`.
