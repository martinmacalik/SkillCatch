import express from 'express';
import cors from 'cors';
import { env } from './lib/env';
import { errorHandler } from './middleware/errorHandler';
import { requestsRouter } from './routes/requests';
import { messagesRouter } from './routes/messages';
import { auditRouter } from './routes/audit';

const app = express();

app.use(
  cors({
    origin: env.ADMIN_CORS_ORIGINS,
    credentials: true,
  })
);
app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok', ts: Date.now() }));
app.use('/requests', requestsRouter);
app.use('/messages', messagesRouter);
app.use('/audit', auditRouter);

app.use(errorHandler);

export default app;
