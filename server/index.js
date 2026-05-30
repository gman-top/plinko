import express from 'express';
import { config } from './config.js';
import { corsMiddleware, securityHeaders, errorHandler } from './middleware/index.js';
import sessions from './routes/sessions.js';
import drops from './routes/drops.js';
import health from './routes/health.js';

const app = express();

app.set('trust proxy', 1);           // behind Render/Railway/Fly proxy
app.use(securityHeaders());
app.use(corsMiddleware());
app.use(express.json({ limit: '8kb' }));

app.use('/api/sessions', sessions);
app.use('/api/drops', drops);
app.use('/api', health);

app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`[plinko-server] ${config.nodeEnv} on :${config.port}`);
  console.log(`[plinko-server] origins: ${config.allowedOrigins.join(', ')}`);
  console.log(`[plinko-server] db:      ${config.databasePath}`);
});
