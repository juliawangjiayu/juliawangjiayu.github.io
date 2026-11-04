export type IdentityErrorCode = 'invalid_username' | 'reserved_username' | 'invalid_email' | 'identity_mismatch';

export class IdentityError extends Error {
  readonly code: IdentityErrorCode;
  constructor(code: IdentityErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = 'IdentityError';
  }
}

export interface NormalizedUsername { username: string; usernameKey: string }
const reserved = new Set([
  'julia wang', 'juliawang', 'julia_wang', 'julia-wang',
  'admin', 'administrator', 'moderator', 'photo booth', 'photobooth',
]);
const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
const encoder = new TextEncoder();

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function normalizeUsername(value: string): NormalizedUsername {
  const username = value.normalize('NFKC').trim();
  const length = [...segmenter.segment(username)].length;
  if (length < 2 || length > 24 || !/^[\p{L}\p{N}][\p{L}\p{M}\p{N}_ -]*[\p{L}\p{M}\p{N}]$/u.test(username) || / {2}/.test(username)) {
    throw new IdentityError('invalid_username', 'Use 2–24 letters or numbers, with optional internal spaces, underscores, or hyphens.');
  }
  const usernameKey = username.toLowerCase();
  if (reserved.has(usernameKey)) {
    throw new IdentityError('reserved_username', 'This username is reserved.');
  }
  return { username, usernameKey };
}

export function normalizeEmail(value: string): string {
  const email = value.trim().toLowerCase();
  const parts = email.split('@');
  if (email.length > 254 || parts.length !== 2 || !parts[0] || !parts[1] ||
      /[\s\p{Cc}\p{Cf}]/u.test(email) || !/^[^\s@.]+(?:\.[^\s@.]+)*$/.test(parts[0]) ||
      !/^[^\s@.]+(?:\.[^\s@.]+)+$/.test(parts[1])) {
    throw new IdentityError('invalid_email', 'Enter a valid email address.');
  }
  return email;
}

async function hmac(input: string, pepper: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(pepper), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, encoder.encode(input)));
}

export async function emailVerifier(email: string, pepper: string): Promise<string> {
  return hmac(`email\0${normalizeEmail(email)}`, pepper);
}

export async function fingerprintIp(ip: string, day: string, pepper: string): Promise<string> {
  return hmac(`ip\0${day}\0${ip}`, pepper);
}

export async function hashSessionToken(token: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', encoder.encode(token)));
}

export function createSessionToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const base64 = btoa(String.fromCharCode(...bytes));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
