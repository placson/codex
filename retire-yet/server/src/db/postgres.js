import pg from 'pg';

const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL;
const NODE_ENV = process.env.NODE_ENV || 'development';

let pool = null;

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

export function getDatabaseUrl() {
  return DATABASE_URL;
}

export function hasDatabaseUrl() {
  return typeof DATABASE_URL === 'string' && DATABASE_URL.trim() !== '';
}

export function getPool() {
  if (!hasDatabaseUrl()) {
    throw createHttpError(
      500,
      'DATABASE_URL is not configured. Set it to a local or hosted Postgres connection string.'
    );
  }

  if (!pool) {
    pool = new Pool({
      connectionString: DATABASE_URL,
      ssl:
        process.env.PGSSLMODE === 'disable' || NODE_ENV === 'development'
          ? false
          : { rejectUnauthorized: false }
    });
  }

  return pool;
}

export async function closePool() {
  if (pool) {
    const activePool = pool;
    pool = null;
    await activePool.end();
  }
}
