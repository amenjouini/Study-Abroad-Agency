import { createHash } from "node:crypto";
import { fileTypeFromBuffer } from "file-type";
import { ValidationError } from "@/lib/errors";

export const ALLOWED_UPLOADS: Record<string, string[]> = {
  "application/pdf": ["pdf"],
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
};

export const DEFAULT_MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export function maxUploadBytes(): number {
  const n = Number(process.env.MAX_UPLOAD_BYTES);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_UPLOAD_BYTES;
}

export interface ValidatedUpload {
  mimeType: string;
  extension: string;
  sizeBytes: number;
  sha256: string;
  safeFilename: string;
}

export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  const cleaned = base.normalize("NFKD").replace(/[^\w.\- ]+/g, "_").replace(/\s+/g, " ").trim();
  return (cleaned || "file").slice(0, 120);
}

/**
 * Validate an upload: size limit, extension whitelist and MIME sniffing of the real content.
 * The declared MIME type is never trusted — the file signature must match an allowed type and the extension.
 */
export async function validateUpload(
  buffer: Buffer,
  filename: string,
  opts: { maxBytes?: number; acceptedMimeTypes?: string[] } = {},
): Promise<ValidatedUpload> {
  const max = opts.maxBytes ?? maxUploadBytes();
  if (buffer.length === 0) throw new ValidationError("The file is empty");
  if (buffer.length > max) throw new ValidationError(`The file exceeds the maximum size of ${Math.round(max / 1024 / 1024)} MB`);

  const ext = (filename.split(".").pop() ?? "").toLowerCase();
  const accepted = opts.acceptedMimeTypes ?? Object.keys(ALLOWED_UPLOADS);
  const allowedExts = accepted.flatMap((m) => ALLOWED_UPLOADS[m] ?? []);
  if (!allowedExts.includes(ext)) throw new ValidationError("Accepted formats: PDF, JPG, PNG");

  const sniffed = await fileTypeFromBuffer(buffer);
  if (!sniffed || !accepted.includes(sniffed.mime)) throw new ValidationError("The file content is not a valid PDF, JPG or PNG");
  if (!(ALLOWED_UPLOADS[sniffed.mime] ?? []).includes(ext)) {
    throw new ValidationError("The file extension does not match its content");
  }

  return {
    mimeType: sniffed.mime,
    extension: sniffed.mime === "image/jpeg" ? "jpg" : ext,
    sizeBytes: buffer.length,
    sha256: createHash("sha256").update(buffer).digest("hex"),
    safeFilename: sanitizeFilename(filename),
  };
}
