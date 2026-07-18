/**
 * AES-GCM vault encryption with PBKDF2(PIN)
 * Private keys / seed never leave the device encrypted blob.
 */

const PBKDF2_ITERS = 250000;
const SALT_LEN = 16;
const IV_LEN = 12;

function toB64(buf) {
  const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf;
  let s = "";
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s);
}

function fromB64(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function deriveKey(pin, salt) {
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey(
    "raw",
    enc.encode(pin),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: PBKDF2_ITERS,
      hash: "SHA-256",
    },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/** Encrypt JSON-serializable object with PIN → portable vault string */
export async function encryptVault(data, pin) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LEN));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
  const key = await deriveKey(pin, salt);
  const plain = new TextEncoder().encode(JSON.stringify(data));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain);
  return JSON.stringify({
    v: 2,
    alg: "AES-GCM-256+PBKDF2-SHA256",
    iter: PBKDF2_ITERS,
    salt: toB64(salt),
    iv: toB64(iv),
    ct: toB64(cipher),
    product: "OpS Crypt LTC",
  });
}

export async function decryptVault(vaultStr, pin) {
  const wrap = typeof vaultStr === "string" ? JSON.parse(vaultStr) : vaultStr;
  const salt = fromB64(wrap.salt);
  const iv = fromB64(wrap.iv);
  const ct = fromB64(wrap.ct);
  const key = await deriveKey(pin, salt);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return JSON.parse(new TextDecoder().decode(plain));
}

export async function pinHash(pin) {
  const data = new TextEncoder().encode("ops-crypt-ltc|v2|" + pin);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return toB64(buf);
}
