import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";
import { env } from "@/lib/env";
import { badRequest } from "@/lib/server/errors";

export const MAX_EVIDENCE_BYTES = 5 * 1024 * 1024;
export const MAX_EVIDENCE_FILES = 3;
const ALLOWED: Record<string, "png" | "jpeg" | "webp"> = { "image/png": "png", "image/jpeg": "jpeg", "image/webp": "webp" };

/** Detects real file type from magic bytes (never trust the client-supplied MIME or extension). */
export function sniffImage(buf: Buffer): "png" | "jpeg" | "webp" | null {
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf.length > 12 && buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") return "webp";
  return null;
}

export interface ProcessedEvidence { data: Buffer; mime: string; sha256: string; size: number }

/**
 * Validates and sanitises an uploaded image:
 * allowlist -> magic-byte check -> declared/actual type match -> decode with pixel limit ->
 * RE-ENCODE (strips EXIF/GPS metadata and neutralises polyglot payloads). Undecodable files are rejected (quarantine).
 */
export async function processEvidence(file: File): Promise<ProcessedEvidence> {
  if (file.size <= 0 || file.size > MAX_EVIDENCE_BYTES) throw badRequest("Each file must be an image under 5 MB.");
  const declared = ALLOWED[file.type];
  if (!declared) throw badRequest("Only PNG, JPEG or WebP screenshots are accepted.");
  const buf = Buffer.from(await file.arrayBuffer());
  const actual = sniffImage(buf);
  if (!actual || actual !== declared) throw badRequest("File contents do not match an allowed image type.");
  let out: Buffer;
  try {
    const img = sharp(buf, { limitInputPixels: 40_000_000, failOn: "error" }).rotate();
    const meta = await img.metadata();
    if (!meta.width || !meta.height) throw new Error("no dimensions");
    out = actual === "png" ? await img.png({ compressionLevel: 9 }).toBuffer()
      : actual === "webp" ? await img.webp({ quality: 90 }).toBuffer()
      : await img.jpeg({ quality: 90 }).toBuffer(); // sharp omits metadata unless .withMetadata() is called
  } catch {
    throw badRequest("This image could not be processed and was rejected.");
  }
  return { data: out, mime: `image/${actual}`, sha256: createHash("sha256").update(out).digest("hex"), size: out.length };
}

/** Random, non-guessable storage key; never derived from user input (no path traversal). */
export function newStorageKey(ext: string): string {
  return `evidence/${new Date().getUTCFullYear()}/${randomUUID()}.${ext}`;
}

function localPath(key: string): string {
  if (!/^evidence\/\d{4}\/[0-9a-f-]{36}\.(png|jpeg|webp)$/.test(key)) throw new Error("invalid storage key");
  const base = path.resolve(env.localStorageDir);
  const p = path.resolve(base, key);
  if (!p.startsWith(base + path.sep)) throw new Error("path traversal");
  return p;
}

export async function putObject(key: string, data: Buffer, mime: string): Promise<void> {
  if (env.storageDriver === "supabase") {
    if (!env.supabaseUrl || !env.supabaseServiceRoleKey) throw new Error("Supabase storage not configured");
    const res = await fetch(`${env.supabaseUrl}/storage/v1/object/${env.supabaseEvidenceBucket}/${key}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.supabaseServiceRoleKey}`, "Content-Type": mime, "x-upsert": "false" },
      body: new Uint8Array(data),
    });
    if (!res.ok) throw new Error(`storage upload failed: ${res.status}`);
    return;
  }
  if (env.isProduction && process.env.VERCEL) throw new Error("Local storage driver cannot be used on Vercel; set STORAGE_DRIVER=supabase");
  const p = localPath(key);
  await fs.mkdir(path.dirname(p), { recursive: true, mode: 0o700 });
  await fs.writeFile(p, data, { mode: 0o600, flag: "wx" });
}

/** Returns either the bytes (local) or a short-lived signed URL (Supabase, 60s). */
export async function getObject(key: string): Promise<{ data?: Buffer; signedUrl?: string }> {
  if (env.storageDriver === "supabase") {
    const res = await fetch(`${env.supabaseUrl}/storage/v1/object/sign/${env.supabaseEvidenceBucket}/${key}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.supabaseServiceRoleKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ expiresIn: 60 }),
    });
    if (!res.ok) throw new Error(`sign failed: ${res.status}`);
    const j = (await res.json()) as { signedURL: string };
    return { signedUrl: `${env.supabaseUrl}/storage/v1${j.signedURL}` };
  }
  return { data: await fs.readFile(localPath(key)) };
}

export async function deleteObject(key: string): Promise<void> {
  if (env.storageDriver === "supabase") {
    await fetch(`${env.supabaseUrl}/storage/v1/object/${env.supabaseEvidenceBucket}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${env.supabaseServiceRoleKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ prefixes: [key] }),
    });
    return;
  }
  await fs.rm(localPath(key), { force: true });
}
