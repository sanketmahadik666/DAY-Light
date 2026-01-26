/**
 * Storage Service Express App
 * Main application entry point
 */

import express from 'express';
import cors from 'cors';
import { StorageService, StorageServiceConfig } from './storage-service';
import { createBatchUploadRouter } from './routes/batch-upload';
import { createUploadRouter } from './routes/upload';
import { createStorageHealthMonitor } from './services/storage-health';

const app = express();
const PORT = process.env.PORT || 3002;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Initialize storage service
const storageConfig: StorageServiceConfig = {
  minio: {
    endPoint: process.env.MINIO_ENDPOINT || 'localhost',
    port: parseInt(process.env.MINIO_PORT || '9000'),
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
    secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
    bucketName: process.env.MINIO_BUCKET || 'daylight-storage',
    region: process.env.MINIO_REGION || 'us-east-1',
  },
  cloudinary: process.env.CLOUDINARY_CLOUD_NAME
    ? {
        cloudName: process.env.CLOUDINARY_CLOUD_NAME,
        apiKey: process.env.CLOUDINARY_API_KEY || '',
        apiSecret: process.env.CLOUDINARY_API_SECRET || '',
        secure: process.env.CLOUDINARY_SECURE !== 'false',
      }
    : undefined,
  fallbackEnabled: process.env.FALLBACK_ENABLED === 'true',
  primaryProvider: (process.env.PRIMARY_PROVIDER as 'minio' | 'cloudinary') || 'minio',
};

const storageService = new StorageService(storageConfig);
const healthMonitor = createStorageHealthMonitor(storageConfig);

// Health check
app.get('/health', async (req, res) => {
  const health = healthMonitor.getHealthStatus();
  const primaryHealthy = healthMonitor.isPrimaryProviderHealthy();
  const fallbackAvailable = healthMonitor.isFallbackAvailable();

  if (primaryHealthy || fallbackAvailable) {
    res.json({
      status: primaryHealthy ? 'ok' : 'degraded',
      service: 'storage-service',
      provider: storageConfig.primaryProvider,
      health,
      fallbackAvailable,
    });
  } else {
    res.status(503).json({
      status: 'error',
      service: 'storage-service',
      error: 'All storage providers unavailable',
      health,
    });
  }
});

// Routes
app.use('/api/upload', createUploadRouter(storageService));
app.use('/api', createBatchUploadRouter(storageService));

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Storage Service] SIGTERM received, shutting down gracefully');
  healthMonitor.stop();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[Storage Service] SIGINT received, shutting down gracefully');
  healthMonitor.stop();
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`[Storage Service] Running on port ${PORT}`);
  console.log(`[Storage Service] Primary provider: ${storageConfig.primaryProvider}`);
  console.log(`[Storage Service] Fallback enabled: ${storageConfig.fallbackEnabled}`);
  
  // Initial health check
  setTimeout(() => {
    const health = healthMonitor.getHealthStatus();
    console.log(`[Storage Service] MinIO: ${health.minio.available ? 'OK' : 'Unavailable'}`);
    if (storageConfig.cloudinary) {
      console.log(`[Storage Service] Cloudinary: ${health.cloudinary.available ? 'OK' : 'Unavailable'}`);
    }
  }, 2000);
});

export default app;
