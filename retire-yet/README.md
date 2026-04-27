# Retire Yet

Full-stack retirement planner with a React/Vite frontend and an Express backend. The app now supports multi-user storage in Postgres for local testing and for straightforward migration to hosted Postgres providers later.

## Architecture

- Frontend: React + Vite in `client/`
- Backend: Express in `server/`
- Storage:
  - Preferred: Postgres via `DATABASE_URL`
  - Fallback: local JSON file in `server/data/userData.json`
- Projection engine: backend-only financial logic in `server/src/services/`

The backend storage layer is isolated behind a repository so you can point the same app at:

- local Postgres in Docker
- Railway Postgres
- Render Postgres
- Neon Postgres
- any standard Postgres connection URL

## Local Setup

1. Install dependencies:

   ```bash
   npm install
   npm run install:all
   ```

2. Copy environment files:

   ```bash
   cp server/.env.example server/.env
   cp client/.env.example client/.env
   ```

3. Start local Postgres:

   ```bash
   npm run db:start
   ```

4. Migrate your existing JSON demo data into Postgres:

   ```bash
   npm run migrate:json-to-postgres --prefix server
   ```

5. Start the app:

   ```bash
   npm run dev
   ```

Frontend runs on `http://localhost:5173`.
Backend runs on `http://localhost:3001`.

## Local Multi-User Testing

The sidebar now includes a `Planner ID` field.

- Enter a new ID like `alice` or `test-couple-1`
- Click `Load planner`
- The backend will load that planner if it exists, or create a fresh default planner automatically

This is for local multi-user testing only. There is still no authentication layer yet.

## Environment Variables

### Server

`server/.env`

```bash
PORT=3001
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/retire_yet
PGSSLMODE=disable
USER_DATA_FILE_PATH=./data/userData.json
```

Notes:

- If `DATABASE_URL` is set, the backend uses Postgres.
- If `DATABASE_URL` is omitted, it falls back to JSON-file storage.
- `PGSSLMODE=disable` is appropriate for local Docker Postgres.
- Hosted Postgres providers usually require SSL, so you would typically remove that override.

### Client

`client/.env`

```bash
VITE_API_BASE_URL=http://localhost:3001/api
VITE_DEFAULT_USER_ID=demo-user
```

## Useful Scripts

### Root

- `npm run dev` starts client and server together
- `npm run dev:client` starts only the Vite frontend
- `npm run dev:server` starts only the Express backend
- `npm run db:start` starts the local Postgres container
- `npm run db:stop` stops the local Postgres container

### Server

- `npm run dev --prefix server` starts the API with nodemon
- `npm run start --prefix server` starts the API normally
- `npm run migrate:json-to-postgres --prefix server` imports `server/data/userData.json` into Postgres

## Storage Migration Path

To move from local development to hosted infrastructure later:

1. Create a hosted Postgres database on Railway, Render, Neon, or another provider.
2. Replace `DATABASE_URL` in `server/.env` or your deployment secrets.
3. Run the same server code without changing the repository or service layers.
4. Migrate data from local Postgres to hosted Postgres with your preferred dump/import approach.

Because the app already uses `DATABASE_URL`, the hosting migration path is mostly operational rather than architectural.

## Project Structure

```text
.
├── client
│   ├── .env.example
│   ├── package.json
│   └── src
├── server
│   ├── .env.example
│   ├── data
│   │   └── userData.json
│   ├── package.json
│   ├── scripts
│   │   └── migrate-json-to-postgres.js
│   └── src
│       ├── db
│       ├── repositories
│       ├── routes
│       ├── services
│       └── validators
├── docker-compose.yml
├── package.json
└── README.md
```
