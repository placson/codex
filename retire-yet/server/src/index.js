import 'dotenv/config';
import app from './app.js';
import { closePool } from './db/postgres.js';
import { initializeUserRepository } from './repositories/userRepository.js';

const PORT = process.env.PORT || 3001;

async function startServer() {
  await initializeUserRepository();

  const server = app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
  });

  async function shutdown() {
    server.close(async () => {
      await closePool();
      process.exit(0);
    });
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

startServer().catch(async (error) => {
  console.error('Failed to start server.', error);
  await closePool();
  process.exit(1);
});
