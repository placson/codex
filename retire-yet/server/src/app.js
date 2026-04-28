import express from 'express';
import cors from 'cors';
import { hasDatabaseUrl } from './db/postgres.js';
import defaultUserRoutes from './routes/defaultUserRoutes.js';
import userRoutes from './routes/userRoutes.js';

const app = express();

app.use(cors());
app.use(express.json());

app.get('/api/health', (_request, response) => {
  response.json({
    status: 'ok',
    storage: hasDatabaseUrl() ? 'postgres' : 'file'
  });
});

app.use('/api/users', userRoutes);
app.use('/api/user', defaultUserRoutes);

app.use((error, _request, response, _next) => {
  console.error(error);

  if (error.statusCode) {
    return response.status(error.statusCode).json({ message: error.message });
  }

  return response.status(500).json({ message: 'Internal server error.' });
});

export default app;
