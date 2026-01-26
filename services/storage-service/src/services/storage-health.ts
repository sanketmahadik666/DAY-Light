/**
 * Storage Health Monitor
 * Monitors MinIO and Cloudinary availability
 */

import { MinIOClient } from '../minio-client';
import { CloudinaryFallback } from '../cloudinary-fallback';
import { StorageServiceConfig } from '../storage-service';

interface HealthStatus {
  minio: {
    available: boolean;
    lastCheck: number;
    error?: string;
  };
  cloudinary: {
    available: boolean;
    lastCheck: number;
    error?: string;
  };
  primaryProvider: 'minio' | 'cloudinary';
  fallbackEnabled: boolean;
}

class StorageHealthMonitor {
  private minioClient: MinIOClient | null = null;
  private cloudinaryClient: CloudinaryFallback | null = null;
  private config: StorageServiceConfig;
  private healthStatus: HealthStatus;
  private healthCheckInterval: NodeJS.Timeout | null = null;

  constructor(config: StorageServiceConfig) {
    this.config = config;
    this.healthStatus = {
      minio: { available: false, lastCheck: 0 },
      cloudinary: { available: false, lastCheck: 0 },
      primaryProvider: config.primaryProvider,
      fallbackEnabled: config.fallbackEnabled,
    };

    this.initializeClients();
    this.startHealthCheck();
  }

  /**
   * Initialize storage clients
   */
  private initializeClients(): void {
    try {
      this.minioClient = new MinIOClient(this.config.minio);
    } catch (error) {
      console.error('[Storage Health] Failed to initialize MinIO client:', error);
    }

    if (this.config.cloudinary) {
      try {
        this.cloudinaryClient = new CloudinaryFallback(this.config.cloudinary);
      } catch (error) {
        console.error('[Storage Health] Failed to initialize Cloudinary client:', error);
      }
    }
  }

  /**
   * Check MinIO health
   */
  private async checkMinIOHealth(): Promise<boolean> {
    if (!this.minioClient) return false;

    try {
      await this.minioClient.fileExists('__health_check__');
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check Cloudinary health
   */
  private async checkCloudinaryHealth(): Promise<boolean> {
    if (!this.cloudinaryClient) return false;

    try {
      // Try to check if Cloudinary is accessible
      await this.cloudinaryClient.fileExists('test');
      return true;
    } catch (error: any) {
      // 404 is OK (means service is available)
      if (error?.http_code === 404) return true;
      return false;
    }
  }

  /**
   * Start periodic health checks
   */
  private startHealthCheck(): void {
    // Initial check
    this.performHealthCheck();

    // Check every 30 seconds
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, 30000);
  }

  /**
   * Perform health check
   */
  private async performHealthCheck(): Promise<void> {
    const now = Date.now();

    // Check MinIO
    try {
      const minioHealthy = await this.checkMinIOHealth();
      this.healthStatus.minio = {
        available: minioHealthy,
        lastCheck: now,
        ...(minioHealthy ? {} : { error: 'MinIO unavailable' }),
      };
    } catch (error) {
      this.healthStatus.minio = {
        available: false,
        lastCheck: now,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }

    // Check Cloudinary
    if (this.config.cloudinary) {
      try {
        const cloudinaryHealthy = await this.checkCloudinaryHealth();
        this.healthStatus.cloudinary = {
          available: cloudinaryHealthy,
          lastCheck: now,
          ...(cloudinaryHealthy ? {} : { error: 'Cloudinary unavailable' }),
        };
      } catch (error) {
        this.healthStatus.cloudinary = {
          available: false,
          lastCheck: now,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }
  }

  /**
   * Get health status
   */
  getHealthStatus(): HealthStatus {
    return { ...this.healthStatus };
  }

  /**
   * Check if primary provider is healthy
   */
  isPrimaryProviderHealthy(): boolean {
    if (this.config.primaryProvider === 'minio') {
      return this.healthStatus.minio.available;
    } else {
      return this.healthStatus.cloudinary.available;
    }
  }

  /**
   * Check if fallback is available
   */
  isFallbackAvailable(): boolean {
    if (!this.config.fallbackEnabled) return false;

    if (this.config.primaryProvider === 'minio') {
      return this.healthStatus.cloudinary.available;
    } else {
      return this.healthStatus.minio.available;
    }
  }

  /**
   * Cleanup
   */
  stop(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
  }
}

export function createStorageHealthMonitor(config: StorageServiceConfig): StorageHealthMonitor {
  return new StorageHealthMonitor(config);
}
