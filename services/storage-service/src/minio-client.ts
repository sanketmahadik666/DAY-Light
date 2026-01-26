/**
 * MinIO Client Configuration
 * Handles object storage operations with error handling and retry logic
 */

import { Client, ClientOptions } from 'minio';
import { Readable } from 'stream';

export interface MinIOConfig {
  endPoint: string;
  port?: number;
  useSSL: boolean;
  accessKey: string;
  secretKey: string;
  region?: string;
  bucketName: string;
}

export class MinIOClient {
  private client: Client;
  private bucketName: string;
  private config: MinIOConfig;

  constructor(config: MinIOConfig) {
    this.config = config;
    this.bucketName = config.bucketName;

    const clientOptions: ClientOptions = {
      endPoint: config.endPoint,
      port: config.port || (config.useSSL ? 443 : 9000),
      useSSL: config.useSSL,
      accessKey: config.accessKey,
      secretKey: config.secretKey,
      region: config.region || 'us-east-1',
    };

    this.client = new Client(clientOptions);
  }

  /**
   * Ensure bucket exists, create if not
   */
  async ensureBucket(): Promise<void> {
    try {
      const exists = await this.client.bucketExists(this.bucketName);
      if (!exists) {
        await this.client.makeBucket(this.bucketName, this.config.region);
        console.log(`Bucket ${this.bucketName} created`);
      }
    } catch (error) {
      console.error('Error ensuring bucket:', error);
      throw error;
    }
  }

  /**
   * Upload file to MinIO
   */
  async uploadFile(
    objectName: string,
    data: Buffer | Readable,
    metadata: {
      contentType: string;
      size?: number;
      [key: string]: any;
    }
  ): Promise<{
    etag: string;
    url: string;
    bucket: string;
    key: string;
  }> {
    try {
      await this.ensureBucket();

      const result = await this.client.putObject(
        this.bucketName,
        objectName,
        data,
        metadata.size || 0,
        {
          'Content-Type': metadata.contentType,
          ...metadata,
        }
      );

      // Generate presigned URL (valid for 7 days)
      const url = await this.client.presignedGetObject(
        this.bucketName,
        objectName,
        7 * 24 * 60 * 60 // 7 days
      );

      return {
        etag: result.etag,
        url,
        bucket: this.bucketName,
        key: objectName,
      };
    } catch (error) {
      console.error('MinIO upload error:', error);
      throw error;
    }
  }

  /**
   * Get file from MinIO
   */
  async getFile(objectName: string): Promise<Buffer> {
    try {
      const stream = await this.client.getObject(this.bucketName, objectName);
      const chunks: Buffer[] = [];

      return new Promise((resolve, reject) => {
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
        stream.on('error', reject);
      });
    } catch (error) {
      console.error('MinIO get error:', error);
      throw error;
    }
  }

  /**
   * Check if file exists
   */
  async fileExists(objectName: string): Promise<boolean> {
    try {
      await this.client.statObject(this.bucketName, objectName);
      return true;
    } catch (error: any) {
      if (error.code === 'NotFound') {
        return false;
      }
      throw error;
    }
  }

  /**
   * Delete file from MinIO
   */
  async deleteFile(objectName: string): Promise<void> {
    try {
      await this.client.removeObject(this.bucketName, objectName);
    } catch (error) {
      console.error('MinIO delete error:', error);
      throw error;
    }
  }

  /**
   * Generate presigned URL
   */
  async getPresignedUrl(objectName: string, expirySeconds: number = 3600): Promise<string> {
    try {
      return await this.client.presignedGetObject(
        this.bucketName,
        objectName,
        expirySeconds
      );
    } catch (error) {
      console.error('MinIO presigned URL error:', error);
      throw error;
    }
  }

  /**
   * List objects in a prefix
   */
  async listObjects(prefix: string): Promise<string[]> {
    try {
      const objects: string[] = [];
      const stream = this.client.listObjects(this.bucketName, prefix, true);

      return new Promise((resolve, reject) => {
        stream.on('data', (obj) => {
          if (obj.name) objects.push(obj.name);
        });
        stream.on('end', () => resolve(objects));
        stream.on('error', reject);
      });
    } catch (error) {
      console.error('MinIO list error:', error);
      throw error;
    }
  }
}
