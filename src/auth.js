// Senhas (PBKDF2), códigos 2FA (TOTP, RFC 6238) e sessões.
const enc = new TextEncoder();
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const randomToken = (n = 32) => b64u(crypto.getRandomValues(new Uint8Array(n)));
export async function sha256(text) { return b64u(await crypto.subtle.digest("SHA-256", enc.encode(text))); }

export async function hashPassword(password, salt) {
  salt = salt || randomToken(16);
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  // 100.000 é o máximo de iterações aceito pelo runtime da Cloudflare.
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: enc.encode(salt), iterations: 100000 }, key, 256);
  return { hash: b64u(bits), salt };
}
export async function checkPassword(password, salt, hash) {
  const h = (await hashPassword(password, salt)).hash;
  if (h.length !== hash.length) return false;
  let diff = 0; for (let i = 0; i < h.length; i++) diff |= h.charCodeAt(i) ^ hash.charCodeAt(i);
  return diff === 0;
}

// ----- TOTP
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function newTotpSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(20)); let bits = "", out = "";
  for (const b of bytes) bits += b.toString(2).padStart(8, "0");
  for (let i = 0; i + 5 <= bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)];
  return out;
}
function b32decode(s) {
  let bits = ""; for (const c of s.replace(/=+$/, "").toUpperCase()) { const v = B32.indexOf(c); if (v < 0) continue; bits += v.toString(2).padStart(5, "0"); }
  const out = new Uint8Array(Math.floor(bits.length / 8)); for (let i = 0; i < out.length; i++) out[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  return out;
}
export async function totpAt(secret, counter) {
  const key = await crypto.subtle.importKey("raw", b32decode(secret), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const msg = new ArrayBuffer(8); const view = new DataView(msg); view.setUint32(0, Math.floor(counter / 2 ** 32)); view.setUint32(4, counter >>> 0);
  const h = new Uint8Array(await crypto.subtle.sign("HMAC", key, msg));
  const o = h[h.length - 1] & 15;
  const code = ((h[o] & 127) << 24 | h[o + 1] << 16 | h[o + 2] << 8 | h[o + 3]) % 1e6;
  return String(code).padStart(6, "0");
}
export async function checkTotp(secret, code, now = Date.now()) {
  code = String(code || "").replace(/\D/g, ""); if (code.length !== 6) return false;
  const c = Math.floor(now / 30000);
  for (const d of [0, -1, 1]) if (await totpAt(secret, c + d) === code) return true;
  return false;
}
export const otpauthUri = (secret, username) => `otpauth://totp/${encodeURIComponent("Gothic:" + username)}?secret=${secret}&issuer=Gothic&algorithm=SHA1&digits=6&period=30`;
