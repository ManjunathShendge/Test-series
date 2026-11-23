import { Client } from 'minio';
import { createHash } from 'node:crypto';
import type { Environment } from '../../config/env.js';

export interface ObjectUploadIntent {
  bucket: string;
  objectKey: string;
  uploadUrl: string;
  expiresAt: Date;
}

export class ObjectStorage {
  private readonly client: Client | null;
  private readonly signingClient: Client | null;

  constructor(env: Environment) {
    if (env.STORAGE_ACCESS_KEY && env.STORAGE_SECRET_KEY && env.STORAGE_ENDPOINT) {
      const options: ConstructorParameters<typeof Client>[0] = {
        endPoint: env.STORAGE_ENDPOINT,
        port: env.STORAGE_PORT ?? (env.STORAGE_USE_SSL === 'true' ? 443 : 9000),
        useSSL: env.STORAGE_USE_SSL === 'true',
        accessKey: env.STORAGE_ACCESS_KEY,
        secretKey: env.STORAGE_SECRET_KEY,
      };
      if (env.STORAGE_REGION) options.region = env.STORAGE_REGION;
      this.client = new Client(options);
      this.signingClient = env.STORAGE_PUBLIC_ENDPOINT
        ? new Client({
            endPoint: env.STORAGE_PUBLIC_ENDPOINT,
            port: env.STORAGE_PUBLIC_PORT ?? (env.STORAGE_PUBLIC_USE_SSL === 'true' ? 443 : 9000),
            useSSL: env.STORAGE_PUBLIC_USE_SSL === 'true',
            accessKey: env.STORAGE_ACCESS_KEY,
            secretKey: env.STORAGE_SECRET_KEY,
            ...(env.STORAGE_REGION ? { region: env.STORAGE_REGION } : {}),
          })
        : this.client;
    } else if (env.APP_ENV === 'local' || env.APP_ENV === 'test') {
      const local = {
        endPoint: '127.0.0.1',
        port: 19000,
        useSSL: false,
        accessKey: 'exam_minio',
        secretKey: 'local_minio_only',
      };
      this.client = new Client(local);
      this.signingClient = new Client(local);
    } else {
      this.client = null;
      this.signingClient = null;
    }
  }

  async presignedPut(
    bucket: string,
    ownerId: string,
    assetId: string,
    filename: string,
  ): Promise<ObjectUploadIntent> {
    if (!this.client || !this.signingClient)
      throw new Error('Object-storage credentials are not configured');
    const exists = await this.client.bucketExists(bucket);
    if (!exists) {
      try {
        await this.client.makeBucket(bucket, 'us-east-1');
      } catch (error) {
        if (!(await this.client.bucketExists(bucket))) throw error;
      }
    }
    const safeName =
      filename
        .replace(/[^a-zA-Z0-9._-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 255) || 'file';
    const objectKey = `${ownerId}/${assetId}/${safeName}`;
    const expiresSeconds = 15 * 60;
    const url = await this.signingClient.presignedPutObject(bucket, objectKey, expiresSeconds);
    return {
      bucket,
      objectKey,
      uploadUrl: url,
      expiresAt: new Date(Date.now() + expiresSeconds * 1000),
    };
  }

  async stat(bucket: string, objectKey: string): Promise<{ size: number; etag: string }> {
    if (!this.client) throw new Error('Object-storage credentials are not configured');
    const result = await this.client.statObject(bucket, objectKey);
    return { size: result.size, etag: result.etag };
  }

  async download(
    bucket: string,
    objectKey: string,
    maxBytes: number,
  ): Promise<{ bytes: Buffer; sha256: string }> {
    if (!this.client) throw new Error('Object-storage credentials are not configured');
    const stream = await this.client.getObject(bucket, objectKey);
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of stream) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
      size += bytes.length;
      if (size > maxBytes) {
        stream.destroy();
        throw new Error('Object exceeds the permitted download size');
      }
      chunks.push(bytes);
    }
    const bytes = Buffer.concat(chunks, size);
    return { bytes, sha256: createHash('sha256').update(bytes).digest('hex') };
  }

  async storeVerified(
    bucket: string,
    objectKey: string,
    bytes: Buffer,
    mimeType: string,
  ): Promise<void> {
    if (!this.client) throw new Error('Object-storage credentials are not configured');
    await this.client.putObject(bucket, objectKey, bytes, bytes.length, {
      'Content-Type': mimeType,
    });
  }

  async remove(bucket: string, objectKey: string): Promise<void> {
    if (!this.client) throw new Error('Object-storage credentials are not configured');
    await this.client.removeObject(bucket, objectKey);
  }

  async presignedDownload(
    bucket: string,
    objectKey: string,
    filename: string,
  ): Promise<{ url: string; expiresAt: Date }> {
    if (!this.signingClient) throw new Error('Object-storage credentials are not configured');
    const expiresSeconds = 5 * 60;
    const safeFilename = filename.replace(/[\r\n"\\]/g, '_').slice(0, 200) || 'document';
    const url = await this.signingClient.presignedGetObject(bucket, objectKey, expiresSeconds, {
      'response-content-type': 'application/octet-stream',
      'response-content-disposition': `attachment; filename="${safeFilename}"`,
      'response-cache-control': 'no-store',
    });
    return { url, expiresAt: new Date(Date.now() + expiresSeconds * 1000) };
  }

  /** Short-lived inline URL for a verified image; the caller has already authorised the viewer. */
  async presignedView(
    bucket: string,
    objectKey: string,
    mimeType: 'image/jpeg' | 'image/png' | 'image/webp',
  ): Promise<{ url: string; expiresAt: Date }> {
    if (!this.signingClient) throw new Error('Object-storage credentials are not configured');
    const expiresSeconds = 5 * 60;
    const url = await this.signingClient.presignedGetObject(bucket, objectKey, expiresSeconds, {
      'response-content-type': mimeType,
      'response-content-disposition': 'inline',
      'response-cache-control': 'private, no-store',
    });
    return { url, expiresAt: new Date(Date.now() + expiresSeconds * 1000) };
  }
}
