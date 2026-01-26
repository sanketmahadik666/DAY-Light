/**
 * Image Service Express App
 */

import express from 'express';
import cors from 'cors';
import transformRouter from './routes/transform';
import { errorHandler } from './middleware/error-handler';

const app = express();
const PORT = process.env.PORT || 3003;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'image-service',
    timestamp: Date.now(),
  });
});

// Routes
app.use('/api', transformRouter);

// Error handler (must be last)
app.use(errorHandler);

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Image Service] SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[Image Service] SIGINT received, shutting down gracefully');
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`[Image Service] Running on port ${PORT}`);
});

export default app;
