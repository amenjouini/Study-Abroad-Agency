import { promises as fs } from "node:fs";
import path from "node:path";
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Private object storage. Files are never served from a public path: downloads go through the authorized
 * route /api/documents/[versionId] (or a short-lived signed URL where the driver supports it).
 */
export interface StorageDriver {
  put(key: string, body: Buffer, opts: { contentType: string }): Promise<void>;
  get(key: string): Promise<Buffer>;
  exists(key: string): Promise<boolean>;
  /** Short-lived signed URL, or null when the driver cannot issue one (local disk). */
  signedUrl(key: string, opts: { expiresInSeconds: number; filename?: string }): Promise<string | null>;
  /** Only used for cleaning up a failed upload before its database row exists. Documents are never deleted. */
  discard(key: string): Promise<void>;
}

function assertSafeKey(key: string): void {
  if (!key || key.includes("..") || path.isAbsolute(key) || key.includes("\\") || key.startsWith("/")) {
    throw new Error(`Unsafe storage key: ${key}`);
  }
}

export class LocalDiskDriver implements StorageDriver {
  constructor(private readonly root: string) {}

  private resolve(key: string): string {
    assertSafeKey(key);
    const full = path.resolve(this.root, key);
    if (!full.startsWith(path.resolve(this.root) + path.sep)) throw new Error("Storage key escapes root");
    return full;
  }

  async put(key: string, body: Buffer): Promise<void> {
    const full = this.resolve(key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, body, { flag: "wx" }); // never overwrite an existing object
  }

  async get(key: string): Promise<Buffer> {
    return fs.readFile(this.resolve(key));
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(this.resolve(key));
      return true;
    } catch {
      return false;
    }
  }

  async signedUrl(): Promise<string | null> {
    return null;
  }

  async discard(key: string): Promise<void> {
    await fs.rm(this.resolve(key), { force: true });
  }
}

export class S3Driver implements StorageDriver {
  private readonly client: S3Client;
  constructor(private readonly bucket: string) {
    this.client = new S3Client({
      region: process.env.S3_REGION ?? "us-east-1",
      endpoint: process.env.S3_ENDPOINT,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
      },
    });
  }

  async put(key: string, body: Buffer, opts: { contentType: string }): Promise<void> {
    assertSafeKey(key);
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: opts.contentType }));
  }

  async get(key: string): Promise<Buffer> {
    assertSafeKey(key);
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return Buffer.from(await res.Body!.transformToByteArray());
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }

  async signedUrl(key: string, opts: { expiresInSeconds: number; filename?: string }): Promise<string> {
    assertSafeKey(key);
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseContentDisposition: opts.filename ? `inline; filename="${opts.filename.replace(/"/g, "")}"` : undefined,
      }),
      { expiresIn: opts.expiresInSeconds },
    );
  }

  async discard(key: string): Promise<void> {
    assertSafeKey(key);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

let driver: StorageDriver | undefined;

export function getStorage(): StorageDriver {
  if (driver) return driver;
  driver =
    process.env.STORAGE_DRIVER === "s3"
      ? new S3Driver(process.env.S3_BUCKET ?? "bonita-documents")
      : new LocalDiskDriver(path.resolve(/* turbopackIgnore: true */ process.env.STORAGE_LOCAL_DIR ?? "./storage"));
  return driver;
}

/** For tests: inject a driver. */
export function setStorageForTests(d: StorageDriver | undefined): void {
  driver = d;
}
