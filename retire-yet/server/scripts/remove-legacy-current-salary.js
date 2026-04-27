import 'dotenv/config';
import { closePool, getPool } from '../src/db/postgres.js';

async function removeLegacyCurrentSalary() {
  const pool = getPool();
  const result = await pool.query(
    `UPDATE user_plans
     SET
       plan_data = jsonb_set(
         plan_data,
         '{income}',
         COALESCE(plan_data->'income', '{}'::jsonb) - 'currentSalary'
       ),
       updated_at = NOW()
     WHERE COALESCE(plan_data->'income', '{}'::jsonb) ? 'currentSalary'`
  );

  console.log(`Removed income.currentSalary from ${result.rowCount} stored plan(s).`);
}

removeLegacyCurrentSalary()
  .catch(async (error) => {
    console.error('Failed to remove legacy currentSalary fields from Postgres.', error);
    await closePool();
    process.exit(1);
  })
  .finally(async () => {
    await closePool();
  });
