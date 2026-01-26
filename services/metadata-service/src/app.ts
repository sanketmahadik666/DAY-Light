/**
 * Metadata Service Express App
 * Main application entry point
 */

import express from 'express';
import cors from 'cors';
import factsRouter from './routes/facts';
import analyticsRouter from './routes/analytics';
import { mongoConnectionManager } from './services/mongodb-connection';
import { errorHandler } from './middleware/error-handler';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check
app.get('/health', async (req, res) => {
  const mongoHealthy = mongoConnectionManager.isConnectionHealthy();
  const stats = mongoConnectionManager.getConnectionStats();

  res.json({
    status: mongoHealthy ? 'ok' : 'degraded',
    service: 'metadata-service',
    mongodb: stats,
  });
});

// Routes
app.use('/api/facts', factsRouter);
app.use('/api/analytics', analyticsRouter);

// Error handler (must be last)
app.use(errorHandler);

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[App] SIGTERM received, shutting down gracefully');
  await mongoConnectionManager.disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[App] SIGINT received, shutting down gracefully');
  await mongoConnectionManager.disconnect();
  process.exit(0);
});

// Start server
async function startServer() {
  try {
    // Connect to MongoDB
    await mongoConnectionManager.connect();

    // Start Express server
    app.listen(PORT, () => {
      console.log(`[Metadata Service] Running on port ${PORT}`);
      console.log(`[Metadata Service] MongoDB: ${mongoConnectionManager.isConnectionHealthy() ? 'Connected' : 'Connecting...'}`);
    });
  } catch (error) {
    console.error('[Metadata Service] Failed to start:', error);
    process.exit(1);
  }
}

startServer();

export default app;
