// UTF-8 safe base64. Shared by encryption and the GitHub contents API.

export function bytesToB64(bytes) {
  const chunk = 0x2000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function b64ToBytes(b64) {
  const binary = atob(String(b64 || '').replace(/\s+/g, ''));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

export function utf8ToB64(text) {
  return bytesToB64(new TextEncoder().encode(text));
}

export function b64ToUtf8(b64) {
  return new TextDecoder().decode(b64ToBytes(b64));
}
