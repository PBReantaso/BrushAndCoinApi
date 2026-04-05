# BrushAndCoinApi

Standalone backend API for the Brush&Coin frontend app.

This backend now has a modular structure and is PostgreSQL-ready while preserving the current API routes.

## Run

```bash
npm install
npm start
```

Server runs at `http://localhost:4000` by default.

## PostgreSQL setup

1. Copy `.env.example` to `.env`.
2. Update `DATABASE_URL` to your Postgres instance.
3. Run migrations:

```bash
npm run migrate
```

If `DATABASE_URL` is not set, the app automatically falls back to in-memory seed data so the existing mobile app flow still works.

### Database errors like `column "payment_method" does not exist`

The API expects commission columns added in migrations `018`–`020`. Run `npm run migrate` again after pulling changes. If the error persists, connect with `psql` and ensure these columns exist on `commissions`: `payment_method`, `escrow_status`, `escrow_funded_at`, `escrow_released_at`, `preferred_payment_method` (all added with `IF NOT EXISTS` in those migrations).

## Project structure

- `src/config` - environment + database connection
- `src/routes` - route registration
- `src/controllers` - HTTP handlers
- `src/services` - business logic
- `src/repositories` - data access (Postgres + memory fallback)
- `db/migrations` - SQL schema + seed migrations
- `scripts/run-migrations.js` - migration runner

## Endpoints

- `GET /health`
- `POST /auth/login`
- `POST /auth/signup`
- `POST /auth/refresh`
- `GET /auth/me`
- `GET /dashboard`
- `GET /artists`
- `GET /projects`
- `GET /messages`

## Auth notes

- `/auth/login` and `/auth/signup` now return `accessToken` and `refreshToken`.
- Use `Authorization: Bearer <accessToken>` for protected endpoints.
- When access token expires, call `/auth/refresh` with `{ "refreshToken": "..." }`.
