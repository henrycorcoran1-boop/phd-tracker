/* ==========================================================================
   Accounts and sessions.

   Passwords are stretched with PBKDF2-SHA256 (210k iterations) via WebCrypto
   and only the derived hash is stored — the plaintext never is. This is real
   hashing, but note the honest limitation of a browser-only app: the check
   happens on the client against local data, so it protects the stored record,
   not the app's boundary. Moving `verify()` behind the RestAdapter is what
   turns this into server-grade auth.
   ========================================================================== */

import store from './store.js';
import { makeUser, colorFor } from './schema.js';

const ITERATIONS = 210000;
const KEY_LENGTH = 32;
const SESSION_KEY = 'session';
const SESSION_DAYS = 30;

const subtle = globalThis.crypto?.subtle || null;

/* -- hashing -------------------------------------------------------------- */

function randomSalt(bytes = 16) {
  const buf = new Uint8Array(bytes);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(buf);
  else for (let i = 0; i < bytes; i += 1) buf[i] = Math.floor(Math.random() * 256);
  return toHex(buf);
}

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function fromHex(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

async function derive(password, saltHex) {
  if (!subtle) return fallbackHash(password, saltHex);
  const encoder = new TextEncoder();
  const material = await subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await subtle.deriveBits(
    { name: 'PBKDF2', salt: fromHex(saltHex), iterations: ITERATIONS, hash: 'SHA-256' },
    material,
    KEY_LENGTH * 8,
  );
  return toHex(bits);
}

/**
 * Only reached when the page is opened without a secure context (e.g. file://),
 * where crypto.subtle is absent. Weaker by design — the app warns in that case.
 */
function fallbackHash(password, saltHex) {
  const input = `${saltHex}:${password}`;
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let round = 0; round < 5000; round += 1) {
    for (let i = 0; i < input.length; i += 1) {
      h1 ^= input.charCodeAt(i) + round;
      h1 = Math.imul(h1, 16777619) >>> 0;
      h2 = (Math.imul(h2 ^ h1, 2246822519) + i) >>> 0;
    }
  }
  return `${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`.repeat(4);
}

/** Constant-time-ish comparison so timing doesn't leak the hash. */
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const hasStrongCrypto = () => Boolean(subtle);

/* -- validation ----------------------------------------------------------- */

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateSignup({ name, email, password }) {
  const errors = {};
  if (!name || name.trim().length < 2) errors.name = 'Enter your full name.';
  if (!EMAIL_RE.test(email || '')) errors.email = 'Enter a valid email address.';
  if (!password || password.length < 8) errors.password = 'Use at least 8 characters.';
  else if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    errors.password = 'Include at least one letter and one number.';
  }
  return errors;
}

export function passwordScore(password = '') {
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[^\w\s]/.test(password)) score += 1;
  return Math.min(score, 4);
}

/* -- accounts ------------------------------------------------------------- */

export function findByEmail(email) {
  const clean = (email || '').toLowerCase().trim();
  if (!clean) return null;
  return store.find('users', (u) => u.email === clean);
}

/**
 * Register an account. If the email was already invited to a workspace, the
 * placeholder record is claimed so existing task assignments carry over.
 */
export async function signup({ name, email, password, title = '' }) {
  const clean = email.toLowerCase().trim();
  const existing = findByEmail(clean);
  if (existing && !existing.pending) {
    return { error: 'An account with that email already exists.' };
  }

  const salt = randomSalt();
  const passwordHash = await derive(password, salt);

  if (existing?.pending) {
    const claimed = store.update('users', existing.id, {
      name: name.trim(),
      title,
      passwordHash,
      salt,
      pending: false,
      color: existing.color || colorFor(clean),
    });
    await startSession(claimed.id);
    return { user: claimed, claimed: true };
  }

  const user = store.insert('users', makeUser({
    name: name.trim(),
    email: clean,
    title,
    passwordHash,
    salt,
    pending: false,
  }));
  await startSession(user.id);
  return { user, claimed: false };
}

export async function login({ email, password }) {
  const user = findByEmail(email);
  const genericError = { error: 'Email or password is incorrect.' };
  if (!user) return genericError;
  if (user.pending || !user.passwordHash) {
    return { error: 'That email was invited but has no password yet. Create an account to claim it.' };
  }
  const attempt = await derive(password, user.salt);
  if (!safeEqual(attempt, user.passwordHash)) return genericError;
  await startSession(user.id);
  return { user };
}

export async function changePassword(userId, { current, next }) {
  const user = store.get('users', userId);
  if (!user) return { error: 'Account not found.' };
  const attempt = await derive(current, user.salt);
  if (!safeEqual(attempt, user.passwordHash)) return { error: 'Current password is incorrect.' };
  if (!next || next.length < 8) return { error: 'New password must be at least 8 characters.' };
  const salt = randomSalt();
  const passwordHash = await derive(next, salt);
  store.update('users', userId, { salt, passwordHash });
  return { ok: true };
}

/* -- sessions ------------------------------------------------------------- */

export async function startSession(userId) {
  const session = { userId, expiresAt: Date.now() + SESSION_DAYS * 86400000 };
  await store.setMeta(SESSION_KEY, session);
  return session;
}

export async function currentUser() {
  const session = await store.meta(SESSION_KEY);
  if (!session?.userId) return null;
  if (session.expiresAt && session.expiresAt < Date.now()) {
    await store.setMeta(SESSION_KEY, null);
    return null;
  }
  return store.get('users', session.userId);
}

export async function logout() {
  await store.setMeta(SESSION_KEY, null);
}

export function updateProfile(userId, patch) {
  return store.update('users', userId, patch);
}
