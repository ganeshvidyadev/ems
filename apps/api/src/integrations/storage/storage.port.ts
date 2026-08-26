/**
 * The contract every object-storage backend implements — S3 in every environment today
 * (MinIO locally, real S3 in prod, both via the same client), but kept as a port for the
 * same reason `PaymentGatewayPort` is: catalog code depends on *intent* — "let this client
 * upload an object", "give me a temporary link to this object" — never on a provider SDK.
 */

export interface PresignedUpload {
  /** PUT this URL directly from the browser/client. Never proxied through the API. */
  uploadUrl: string;
  storageKey: string;
  expiresInSeconds: number;
}

export interface ObjectMetadata {
  contentType: string | null;
  sizeBytes: number;
  etag: string | null;
}

export interface StoragePort {
  /**
   * A time-boxed PUT URL scoped to one key and content type.
   *
   * `maxBytes` is advisory only — S3 presigned PUT URLs cannot enforce a size cap
   * server-side; the real limit is enforced when the upload is confirmed (`headObject`
   * after the fact) and by the bucket's lifecycle/quota policy.
   */
  presignUpload(key: string, contentType: string, maxBytes: number): Promise<PresignedUpload>;

  /** A time-boxed GET URL — used for bulk-export downloads and private media previews. */
  presignDownload(key: string, expiresInSeconds?: number): Promise<string>;

  /** Confirms an object exists and reports what the client actually uploaded. */
  headObject(key: string): Promise<ObjectMetadata | null>;

  /** Downloads an object's bytes — used by the media processor to run `sharp` over it. */
  getObject(key: string): Promise<Buffer>;

  putObject(key: string, body: Buffer, contentType: string): Promise<void>;

  deleteObject(key: string): Promise<void>;

  /** The public URL for a key, assuming the bucket serves it directly or via a CDN in front of it. */
  publicUrl(key: string): string;
}

export const STORAGE_PORT = Symbol('STORAGE_PORT');
