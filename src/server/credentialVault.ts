import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export interface MirrorCredentials { accessKeyId: string; secretAccessKey: string }

function key(): Buffer {
  const raw = process.env.CHANNEL_MASTER_KEY || '';
  const buf = Buffer.from(raw, 'base64');
  if (buf.length !== 32) throw new Error('CHANNEL_MASTER_KEY must be 32 bytes, base64-encoded.');
  return buf;
}

/** AES-256-GCM; output = base64(iv | tag | ciphertext). The mirror id is bound as additional data. */
export function sealCredentials(creds: MirrorCredentials, mirrorId: string, masterKey = key()): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', masterKey, iv);
  cipher.setAAD(Buffer.from(mirrorId));
  const body = Buffer.concat([cipher.update(JSON.stringify(creds), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64');
}

export function openCredentials(sealed: string, mirrorId: string, masterKey = key()): MirrorCredentials {
  const raw = Buffer.from(sealed, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', masterKey, raw.subarray(0, 12));
  decipher.setAAD(Buffer.from(mirrorId));
  decipher.setAuthTag(raw.subarray(12, 28));
  const text = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
  return JSON.parse(text) as MirrorCredentials;
}
