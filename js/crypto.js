import { b64ToBytes, bytesToB64 } from './b64.js?v=v4';
import { coded } from './errors.js?v=v4';

export const DEFAULT_ITERATIONS = 600_000;
const AAD = new TextEncoder().encode('action-manager-seal-v1');
const keyCache = new Map();

async function deriveKey(passphrase, salt, iterations) {
  const id = `${iterations}:${bytesToB64(salt)}:${passphrase}`;
  if (keyCache.has(id)) return keyCache.get(id);
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  keyCache.set(id, key);
  return key;
}

export function clearKeyCache() {
  keyCache.clear();
}

export async function encryptJson(data, passphrase, { salt = null, iterations = DEFAULT_ITERATIONS } = {}) {
  if (!passphrase) throw coded('MISSING_PASSPHRASE');
  const saltBytes = salt ? b64ToBytes(salt) : crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, saltBytes, iterations);
  const plain = new TextEncoder().encode(JSON.stringify(data));
  const cipher = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: AAD },
    key,
    plain,
  ));
  const file = {
    format: 'action-manager-seal',
    v: 1,
    kdf: 'PBKDF2-SHA-256',
    iterations,
    salt: bytesToB64(saltBytes),
    iv: bytesToB64(iv),
    ciphertext: bytesToB64(cipher),
  };
  return { text: JSON.stringify(file), salt: file.salt, iterations };
}

export async function decryptJson(text, passphrase) {
  if (!passphrase) throw coded('MISSING_PASSPHRASE');
  let file;
  try {
    file = JSON.parse(text);
  } catch {
    throw coded('BAD_FILE');
  }
  if (!file || file.format !== 'action-manager-seal' || !file.salt || !file.iv || !file.ciphertext) {
    throw coded('BAD_FILE');
  }
  const iterations = Number(file.iterations) || DEFAULT_ITERATIONS;
  try {
    const key = await deriveKey(passphrase, b64ToBytes(file.salt), iterations);
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: b64ToBytes(file.iv), additionalData: AAD },
      key,
      b64ToBytes(file.ciphertext),
    );
    const data = JSON.parse(new TextDecoder().decode(plain));
    if (!data || !Array.isArray(data.items)) throw coded('BAD_FILE');
    return { data, salt: file.salt, iterations };
  } catch (err) {
    if (err.code === 'BAD_FILE') throw err;
    throw coded('BAD_PASSPHRASE');
  }
}
