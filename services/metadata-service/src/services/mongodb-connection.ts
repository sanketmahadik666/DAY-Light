/**
 * MongoDB Connection Manager
 * Handles connection pooling, health checks, and graceful reconnection
 */

import mongoose from 'mongoose';

interface ConnectionOptions {
  uri: string;
  maxPoolSize?: number;
  minPoolSize?: number;
  maxIdleTimeMS?: number;
  serverSelectionTimeoutMS?: number;
  socketTimeoutMS?: number;
  connectTimeoutMS?: number;
  retryWrites?: boolean;
  retryReads?: boolean;
}

class MongoDBConnectionManager {
  private uri: string;
  private options: ConnectionOptions;
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 5;
  private readonly RECONNECT_DELAY = 5000; // 5 seconds
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private isConnected = false;

  constructor(options: ConnectionOptions) {
    this.uri = options.uri;
    this.options = {
      maxPoolSize: 10,
      minPoolSize: 2,
      maxIdleTimeMS: 30000,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 10000,
      retryWrites: true,
      retryReads: true,
      ...options,
    };

    this.setupEventListeners();
  }

  /**
   * Setup MongoDB event listeners
   */
  private setupEventListeners(): void {
    mongoose.connection.on('connected', () => {
      console.log('[MongoDB] Connected');
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.startHealthCheck();
    });

    mongoose.connection.on('error', (error) => {
      console.error('[MongoDB] Connection error:', error);
      this.isConnected = false;
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('[MongoDB] Disconnected');
      this.isConnected = false;
      this.attemptReconnect();
    });

    mongoose.connection.on('reconnected', () => {
      console.log('[MongoDB] Reconnected');
      this.isConnected = true;
      this.reconnectAttempts = 0;
    });
  }

  /**
   * Connect to MongoDB
   */
  async connect(): Promise<void> {
    try {
      await mongoose.connect(this.uri, {
        maxPoolSize: this.options.maxPoolSize,
        minPoolSize: this.options.minPoolSize,
        maxIdleTimeMS: this.options.maxIdleTimeMS,
        serverSelectionTimeoutMS: this.options.serverSelectionTimeoutMS,
        socketTimeoutMS: this.options.socketTimeoutMS,
        connectTimeoutMS: this.options.connectTimeoutMS,
        retryWrites: this.options.retryWrites,
        retryReads: this.options.retryReads,
      });

      this.isConnected = true;
      this.startHealthCheck();
    } catch (error) {
      console.error('[MongoDB] Initial connection failed:', error);
      this.isConnected = false;
      this.attemptReconnect();
      throw error;
    }
  }

  /**
   * Attempt reconnection with exponential backoff
   */
  private async attemptReconnect(): Promise<void> {
    if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
      console.error('[MongoDB] Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.RECONNECT_DELAY * Math.pow(2, this.reconnectAttempts - 1);

    console.log(`[MongoDB] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.MAX_RECONNECT_ATTEMPTS})`);

    setTimeout(async () => {
      try {
        await mongoose.connect(this.uri, {
          maxPoolSize: this.options.maxPoolSize,
          minPoolSize: this.options.minPoolSize,
        });
      } catch (error) {
        console.error('[MongoDB] Reconnection failed:', error);
        this.attemptReconnect();
      }
    }, delay);
  }

  /**
   * Start health check
   */
  private startHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(async () => {
      try {
        await mongoose.connection.db.admin().ping();
      } catch (error) {
        console.error('[MongoDB] Health check failed:', error);
        this.isConnected = false;
      }
    }, 30000); // Every 30 seconds
  }

  /**
   * Check if connected
   */
  isConnectionHealthy(): boolean {
    return this.isConnected && mongoose.connection.readyState === 1;
  }

  /**
   * Graceful disconnect
   */
  async disconnect(): Promise<void> {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    try {
      await mongoose.connection.close();
      console.log('[MongoDB] Disconnected gracefully');
    } catch (error) {
      console.error('[MongoDB] Error during disconnect:', error);
    }
  }

  /**
   * Get connection stats
   */
  getConnectionStats(): {
    readyState: number;
    host: string;
    name: string;
    isConnected: boolean;
  } {
    return {
      readyState: mongoose.connection.readyState,
      host: mongoose.connection.host,
      name: mongoose.connection.name,
      isConnected: this.isConnected,
    };
  }
}

export const mongoConnectionManager = new MongoDBConnectionManager({
  uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/daylight',
  maxPoolSize: 10,
  minPoolSize: 2,
});
