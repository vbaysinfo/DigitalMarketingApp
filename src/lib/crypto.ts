import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// Sensitive credentials (OAuth access/refresh tokens, page tokens) are encrypted
// at rest with AES-256-GCM. The key never leaves the server.

function keyFrom(name: string, devFallback: string): Buffer {
  const raw = process.env[name];
  if (!raw) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(`${name} must be set in production.`);
    }
    return createHash("sha256").update(devFallback).digest();
  }
  return createHash("sha256").update(raw).digest();
}

const encKey = () => keyFrom("ENCRYPTION_KEY", "dev-only-encryption-key");
const sessionKey = () => keyFrom("SESSION_SECRET", "dev-only-session-secret");

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encKey(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), data.toString("base64url")].join(".");
}

export function decrypt(payload: string): string {
  const [v, iv, tag, data] = payload.split(".");
  if (v !== "v1") throw new Error("Unknown ciphertext version");
  const decipher = createDecipheriv("aes-256-gcm", encKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}

export function hmac(value: string): string {
  return createHmac("sha256", sessionKey()).update(value).digest("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}
