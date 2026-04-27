import 'dotenv/config';
import { getUserStore } from '../src/repositories/fileUserRepository.js';
import { closePool } from '../src/db/postgres.js';
import {
  initializePostgresRepository,
  saveStoredUser
} from '../src/repositories/postgresUserRepository.js';

async function migrateJsonToPostgres() {
  const store = await getUserStore();
  const users = Object.entries(store.users ?? {});

  if (users.length === 0) {
    console.log('No users found in JSON store. Nothing to migrate.');
    return;
  }

  await initializePostgresRepository();

  for (const [userId, planData] of users) {
    await saveStoredUser(userId, {
      ...planData,
      userId: planData.userId || userId
    });
  }

  console.log(`Migrated ${users.length} user plan(s) from JSON to Postgres.`);
}

migrateJsonToPostgres()
  .catch(async (error) => {
    console.error('Failed to migrate JSON user data to Postgres.', error);
    await closePool();
    process.exit(1);
  })
  .finally(async () => {
    await closePool();
  });
