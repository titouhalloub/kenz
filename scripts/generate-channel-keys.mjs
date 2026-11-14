// Usage: node scripts/generate-channel-keys.mjs
// Prints a signing key pair (ECDSA P-256) and a master key for sealing mirror credentials.
import { webcrypto, randomBytes } from 'node:crypto';
const pair = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const b64 = (buf) => Buffer.from(buf).toString('base64');
console.log('# Server only (never ship to the app):');
console.log(`CHANNEL_SIGNING_PRIVATE_KEY=${b64(await webcrypto.subtle.exportKey('pkcs8', pair.privateKey))}`);
console.log(`CHANNEL_MASTER_KEY=${randomBytes(32).toString('base64')}`);
console.log('# App (public, pinned):');
console.log(`VITE_CHANNEL_SIGNING_PUBLIC_KEY=${b64(await webcrypto.subtle.exportKey('spki', pair.publicKey))}`);
