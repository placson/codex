import { getPool } from '../db/postgres.js';
import { validateUserPlanData } from '../validators/userDataValidator.js';

let isInitialized = false;

const CREATE_USER_PLANS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS user_plans (
    user_id TEXT PRIMARY KEY,
    plan_data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`;

const CREATE_UPDATED_AT_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS user_plans_updated_at_idx
  ON user_plans (updated_at DESC);
`;

async function ensureInitialized() {
  if (isInitialized) {
    return;
  }

  const pool = getPool();
  await pool.query(CREATE_USER_PLANS_TABLE_SQL);
  await pool.query(CREATE_UPDATED_AT_INDEX_SQL);
  isInitialized = true;
}

export async function initializePostgresRepository() {
  await ensureInitialized();
}

export async function getStoredUserById(userId) {
  await ensureInitialized();

  const pool = getPool();
  const result = await pool.query(
    `SELECT plan_data
     FROM user_plans
     WHERE user_id = $1`,
    [userId]
  );

  if (result.rowCount === 0) {
    return null;
  }

  return result.rows[0].plan_data;
}

export async function saveStoredUser(userId, userData) {
  await ensureInitialized();
  validateUserPlanData(userData);

  const pool = getPool();
  await pool.query(
    `INSERT INTO user_plans (user_id, plan_data)
     VALUES ($1, $2::jsonb)
     ON CONFLICT (user_id)
     DO UPDATE SET
       plan_data = EXCLUDED.plan_data,
       updated_at = NOW()`,
    [userId, JSON.stringify(userData)]
  );

  return userData;
}
