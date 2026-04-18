# Retirement Planner

Single-user retirement calculator built with React, Express, and PostgreSQL.

## What is included

- React frontend served by Vite
- Express API server
- PostgreSQL persistence
- Profile, retirement targets, assets, and additional income sections
- Scenario-based retirement projections
- Monte Carlo summary
- Printable year-by-year retirement timetable

## Ports

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:3001`
- PostgreSQL: usually `localhost:5432`

## Requirements

- Node.js 18+
- npm
- PostgreSQL 14+ recommended

## Environment setup

1. Copy the example env file:

```bash
cp .env.example .env
```

2. Update `.env` if your PostgreSQL settings differ from local defaults.

The app supports either a full `DATABASE_URL` or the individual PostgreSQL variables:

- `PGHOST`
- `PGPORT`
- `PGUSER`
- `PGPASSWORD`
- `PGDATABASE`
- `DATABASE_SSL`
- `PORT` for the backend server, default `3001`

## Database setup

Create the database before starting the app:

```bash
createdb finance_planner
```

If you use a different database name, update `.env` to match.

On startup, the backend automatically:

- applies `db/schema.sql`
- runs compatibility migrations
- seeds the default single-user rows

You do not need to run schema SQL manually for local development.

## Install dependencies

```bash
npm install
```

## Start the full service

Run both the backend and frontend together:

```bash
npm run dev
```

That starts:

- `npm run dev:server` for the Express API on port `3001`
- `npm run dev:client` for the Vite frontend on port `5173`

## Authentication in local development

The app now uses multi-user email-code authentication.

- Register with first name, last name, and email
- Sign in with a one-time verification code
- In local development, the verification code is exposed in the UI and logged by the backend for testing

For production deployment, replace the local debug-code behavior with a real email delivery provider.

## Start services individually

Start only the backend:

```bash
npm run dev:server
```

Start only the frontend:

```bash
npm run dev:client
```

The frontend expects the backend to be running locally.

## Production-style startup

Build the frontend:

```bash
npm run build
```

Start the backend server:

```bash
npm start
```

In production mode, the Express server serves the built frontend from `dist/`.

## Useful local checks

Backend health check:

```bash
curl http://localhost:3001/api/health
```

Retirement targets API:

```bash
curl http://localhost:3001/api/retirement-targets
```

## Development flow

1. Start PostgreSQL.
2. Create the `finance_planner` database if it does not exist.
3. Run `npm install`.
4. Run `npm run dev`.
5. Open `http://localhost:5173`.

## Scripts

- `npm run dev`: start frontend and backend together
- `npm run dev:server`: start backend in watch mode
- `npm run dev:client`: start Vite frontend
- `npm run build`: build the frontend
- `npm start`: start the production server
