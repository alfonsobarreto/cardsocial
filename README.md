# CardSocial

**Digital business cards with Vault, Smart Cards, AI Moderation (Azure Content Safety) and Admin Dashboard.**

Stack: Node.js · Express · MongoDB · React Native (Expo)

---

## Project Structure

```
cardsocial/
├── backend/        # Node.js + Express REST API
│   └── src/
│       ├── config/         # Database connection
│       ├── controllers/    # Business logic
│       ├── middleware/      # Auth, moderation
│       ├── models/         # Mongoose schemas
│       ├── routes/         # Express routers
│       └── __tests__/      # Jest unit tests
└── mobile/         # React Native (Expo) app
    └── src/
        ├── context/        # Auth context
        ├── navigation/     # React Navigation
        ├── screens/        # App screens
        └── services/       # Axios API client
```

---

## Features

| Feature | Description |
|---|---|
| **Digital Business Cards** | Create, share & embed QR-code-enabled digital cards |
| **Smart Cards** | Analytics (view & share counts), public slug URLs |
| **Vault (Bóveda)** | AES-256 encrypted storage for passwords, notes, documents |
| **AI Moderation** | Azure Content Safety moderates card content before publish |
| **Admin Dashboard** | Stats, user management, card moderation queue, report handling |

---

## Backend Setup

### Requirements
- Node.js >= 18
- MongoDB >= 6

### Steps

```bash
cd backend
cp .env.example .env   # fill in your values
npm install
npm run dev            # starts on http://localhost:5000
```

### Environment Variables

| Variable | Description |
|---|---|
| `MONGODB_URI` | MongoDB connection string |
| `JWT_SECRET` | Secret for signing JWTs |
| `JWT_EXPIRES_IN` | JWT expiry (default `7d`) |
| `VAULT_ENCRYPTION_KEY` | 32-character key for AES-256 vault encryption |
| `AZURE_CONTENT_SAFETY_ENDPOINT` | Azure Content Safety endpoint URL |
| `AZURE_CONTENT_SAFETY_KEY` | Azure Content Safety API key |

> Moderation gracefully degrades – if Azure credentials are not set, content passes through unmoderated.

### API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | — | Register user |
| POST | `/api/auth/login` | — | Login, get JWT |
| GET | `/api/auth/me` | Auth | Current user |
| GET | `/api/cards` | Auth | List my cards |
| POST | `/api/cards` | Auth | Create card (moderated) |
| PUT | `/api/cards/:id` | Auth | Update card (moderated) |
| DELETE | `/api/cards/:id` | Auth | Delete card |
| GET | `/api/cards/public/:slug` | — | View public card |
| POST | `/api/cards/public/:slug/share` | — | Increment share count |
| GET | `/api/vault` | Auth | List vault items |
| POST | `/api/vault` | Auth | Create encrypted item |
| GET | `/api/vault/:id/data` | Auth | Decrypt & retrieve item |
| PUT | `/api/vault/:id` | Auth | Update item |
| DELETE | `/api/vault/:id` | Auth | Delete item |
| GET | `/api/contacts` | Auth | List contacts |
| POST | `/api/contacts` | Auth | Add contact |
| DELETE | `/api/contacts/:id` | Auth | Remove contact |
| POST | `/api/reports` | Auth | Report a card |
| GET | `/api/admin/stats` | Admin | Dashboard stats |
| GET | `/api/admin/users` | Admin | List users |
| PUT | `/api/admin/users/:id` | Admin | Update user (role/status) |
| GET | `/api/admin/cards/pending` | Admin | Pending moderation queue |
| PUT | `/api/admin/cards/:id/moderate` | Admin | Approve / reject card |
| GET | `/api/admin/reports` | Admin | List reports |
| PUT | `/api/admin/reports/:id` | Admin | Update report |

Auth = requires `Authorization: Bearer <token>` header  
Admin = requires admin role

### Run Tests

```bash
cd backend && npm test
```

---

## Mobile Setup

### Requirements
- Node.js >= 18
- Expo CLI (`npm i -g expo-cli`)

### Steps

```bash
cd mobile
npm install
# Set your API URL:
export EXPO_PUBLIC_API_URL=http://localhost:5000/api
npx expo start
```

Scan the QR code with the Expo Go app (iOS / Android) or press `i` / `a` to launch a simulator.

---

## AI Moderation (Azure Content Safety)

Card text fields (`name`, `bio`, `jobTitle`, `company`) are automatically scanned when a card is created or updated. Content with severity >= 2 in any category (Hate, SelfHarm, Sexual, Violence) is rejected with HTTP 422.

Configure in `backend/.env`:

```
AZURE_CONTENT_SAFETY_ENDPOINT=https://your-resource.cognitiveservices.azure.com/
AZURE_CONTENT_SAFETY_KEY=your_key_here
```

---

## Security

- Passwords hashed with **bcryptjs** (cost factor 12)
- JWT tokens with configurable expiry
- Vault data encrypted with **AES-256** (CryptoJS) before storage
- Rate limiting (100 req / 15 min) on all routes
- `helmet` sets security HTTP headers
- Admin routes protected by role-based middleware
