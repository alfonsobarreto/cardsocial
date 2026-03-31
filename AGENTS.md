# AGENTS.md

## Cursor Cloud specific instructions

### Overview

Card-Social is a React Native (Expo SDK 54) mobile app with an Express.js backend. The mobile app is the primary product (iOS/Android); web support is partial due to native-only dependencies (e.g. `react-native-pdf`).

### Services

| Service | How to run | Port | Notes |
|---------|-----------|------|-------|
| **Express backend** | `node backend/src/server.js` (or `npm run backend:start` from root) | 4000 | Requires MongoDB running locally |
| **Expo Metro dev server** | `npx expo start --web --port 8081` from root | 8081 | Web bundle has pre-existing error from `react-native-pdf` native-only import |
| **MongoDB** | `mongod --dbpath /data/db --logpath /var/log/mongod.log --logappend` | 27017 | Must be started before the backend |

### Starting the backend

1. Ensure MongoDB is running: `mongod --dbpath /data/db --logpath /var/log/mongod.log --logappend &`
2. Start backend: `node backend/src/server.js` or `npm run backend:start`
3. Verify: `curl http://localhost:4000/api/health` should return `{"ok":true,"service":"moderation-backend"}`

### Environment files

- Root `.env` — Expo public env vars (moderation API URL, gateway key, moderation bypass)
- `backend/.env` — Backend config (MongoDB URI, Azure stubs, JWT secrets, admin creds)
- `.env.example` files document all available variables

### Gotchas

- The backend requires `@azure/communication-email` which is not listed in `backend/package.json` — it must be installed via `cd backend && npm install @azure/communication-email`.
- `assertRequiredConfig()` in `backend/src/config.js` enforces: `MONGO_URI`, `AZURE_CONTENT_SAFETY_ENDPOINT`, `AZURE_CONTENT_SAFETY_KEY`, `API_GATEWAY_KEY`, `MODERATION_JWT_SECRET`, `EMAIL_OTP_SECRET`. For local dev, stub values work for Azure vars (the backend starts, but moderation endpoints will fail).
- The backend has `eslint` in devDependencies but no `.eslintrc` config file — `npm run lint` fails.
- TypeScript has pre-existing errors (missing `expo-crypto` type declarations, errors in `myprofile.tsx`, `register.tsx`, `Themed.tsx`). The `expo-crypto` and `expo-av` runtime packages must be installed via `npx expo install expo-crypto expo-av`.
- The Expo web build fails due to `react-native-pdf` importing native-only RN internals (`codegenNativeComponent`). This is a known limitation — the app targets mobile primarily.
- The smoke test (`npm run smoke:test`) expects the backend on port 5000 (hardcoded in `scripts/smoke-test-all.mjs`), not port 4000. It also requires network access to Firebase for auth tests.

### Lint / Type-check

- **TypeScript**: `npx tsc --noEmit` from root (pre-existing errors exist)
- **Backend ESLint**: No eslint config present; `npm run lint` in `backend/` will fail
