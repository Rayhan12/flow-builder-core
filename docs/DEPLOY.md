# Deploy Flow Builder

Two hosts: Firebase Hosting for the web app (main), Vercel for the MCP function at `/api/mcp`. Never commit a service account key.

## Firebase Hosting (web app)

1. Copy `.env.example` to `.env.local` and fill the `VITE_FIREBASE_*` values from Firebase console > Project settings > General > Your apps.
2. For production builds set `VITE_USE_EMULATORS=false` and `VITE_MCP_URL=https://flow-builder-core.vercel.app/api/mcp`.
3. Build and deploy:

```bash
npm run build
firebase deploy --only hosting,firestore --project flow-builder-core
```

Firestore rules deploy with that command. Do not deploy Cloud Functions; Spark plan stays as-is.

## Vercel (MCP function)

The GitHub `main` branch auto-deploys to project `flow-builder-core`. Production domain: https://flow-builder-core.vercel.app. MCP URL: https://flow-builder-core.vercel.app/api/mcp.

Root `vercel.json` builds the Vite SPA to `dist`, rewrites non-`/api` paths to `/index.html`, and runs `api/mcp.ts` with `maxDuration` 30.

### Server env vars (Vercel project settings)

| Name | Purpose |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT_KEY` | Service account JSON, raw or base64 (preferred) |
| `FIREBASE_SERVICE_ACCOUNT` | Same as above; used only if `_KEY` is unset |
| `FIREBASE_PROJECT_ID` | `flow-builder-core` |

### SPA env vars on Vercel (optional mirror of the Hosting build)

| Name | Example |
|---|---|
| `VITE_FIREBASE_API_KEY` | from Firebase web config |
| `VITE_FIREBASE_AUTH_DOMAIN` | `flow-builder-core.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | `flow-builder-core` |
| `VITE_FIREBASE_STORAGE_BUCKET` | `flow-builder-core.firebasestorage.app` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | from Firebase web config |
| `VITE_FIREBASE_APP_ID` | from Firebase web config |
| `VITE_USE_EMULATORS` | `false` |
| `VITE_MCP_URL` | `https://flow-builder-core.vercel.app/api/mcp` |

### Create a service account key

1. Firebase console > Project settings > Service accounts > Generate new private key.
2. Encode for the env var (macOS): `base64 -i key.json | pbcopy`
3. Paste into Vercel as `FIREBASE_SERVICE_ACCOUNT_KEY`. Raw JSON also works.
4. Delete the downloaded `key.json` from your machine when done. Never commit it.

When `FIRESTORE_EMULATOR_HOST` is set (local emulator tests), the function uses the emulator with project id `flow-builder-core` and ignores the service account.
