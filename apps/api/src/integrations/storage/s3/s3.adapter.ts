import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Configuration } from '../../../config/configuration';
import type { ObjectMetadata, PresignedUpload, StoragePort } from '../storage.port';

const DEFAULT_UPLOAD_TTL_SECONDS = 300;
const DEFAULT_DOWNLOAD_TTL_SECONDS = 3_600;

/**
 * S3-compatible adapter — MinIO locally, AWS S3 in prod, same client either way via
 * `forcePathStyle` (MinIO needs path-style bucket addressing; real S3 does not care).
 */
@Injectable()
export class S3StorageAdapter implements StoragePort {
  private readonly logger = new Logger(S3StorageAdapter.name);
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly config: Configuration['storage'];

  constructor(configService: ConfigService) {
    this.config = configService.getOrThrow<Configuration['storage']>('storage');
    this.bucket = this.config.bucket;

    this.client = new S3Client({
      region: this.config.region,
      endpoint: this.config.endpoint,
      forcePathStyle: this.config.forcePathStyle,
      credentials:
        this.config.accessKey && this.config.secretKey
          ? { accessKeyId: this.config.accessKey, secretAccessKey: this.config.secretKey }
          : undefined,
    });
  }

  async presignUpload(
    key: string,
    contentType: string,
    _maxBytes: number,
  ): Promise<PresignedUpload> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(this.client, command, {
      expiresIn: DEFAULT_UPLOAD_TTL_SECONDS,
    });

    return { uploadUrl, storageKey: key, expiresInSeconds: DEFAULT_UPLOAD_TTL_SECONDS };
  }

  async presignDownload(
    key: string,
    expiresInSeconds = DEFAULT_DOWNLOAD_TTL_SECONDS,
  ): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }

  async headObject(key: string): Promise<ObjectMetadata | null> {
    try {
      const result = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return {
        contentType: result.ContentType ?? null,
        sizeBytes: result.ContentLength ?? 0,
        etag: result.ETag ?? null,
      };
    } catch (error) {
      const name = (error as { name?: string }).name;
      if (name === 'NotFound' || name === 'NoSuchKey') return null;
      throw error;
    }
  }

  async getObject(key: string): Promise<Buffer> {
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const chunks: Buffer[] = [];
    // The SDK's Body is a Node.js Readable in this runtime (not a web ReadableStream).
    for await (const chunk of result.Body as AsyncIterable<Buffer>) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks);
  }

  async putObject(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  async deleteObject(key: string): Promise<void> {
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (error) {
      // Best-effort: a missing object is already the desired end state.
      this.logger.warn(
        `Failed to delete ${key}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  publicUrl(key: string): string {
    const base = this.config.endpoint ?? `https://${this.bucket}.s3.${this.config.region}.amazonaws.com`;
    return this.config.forcePathStyle ? `${base}/${this.bucket}/${key}` : `${base}/${key}`;
  }
}
