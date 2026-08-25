import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Opaque, unguessable tokens for refresh cookies and customer order tracking
 * links. 32 bytes of CSPRNG output is far beyond brute-force reach.
 */
export function generateOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString('hex');
}

/** Refresh tokens are stored hashed so a database leak cannot mint sessions. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function safeCompare(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}
