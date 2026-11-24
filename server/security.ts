import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import type { Response } from 'express';
import { z } from 'zod';

function derive(value: string, salt: string) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(value, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }, (error, buffer) => {
      if (error) reject(error);
      else resolve(buffer);
    });
  });
}
export const token = () => randomBytes(32).toString('base64url');
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export const day = 86_400_000;

export async function hashPassword(value: string) {
  const salt = randomBytes(16).toString('hex');
  return salt + ':' + (await derive(value, salt)).toString('hex');
}
export async function verifyPassword(value: string, stored = '00000000000000000000000000000000:' + '0'.repeat(128)) {
  const [salt, expected] = stored.split(':');
  const comparison = await derive(value, salt);
  const hash = Buffer.from(expected, 'hex');
  return hash.length === comparison.length && timingSafeEqual(hash, comparison);
}
export const password = z.string().min(12).max(128);
export const email = z.email().trim().toLowerCase().max(254);
export const slug = z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).min(3).max(48);
export const name = z.string().trim().min(2).max(120);
export const uuid = z.uuid();
export const isoDate = z.iso.date();
export const secureToken = z.string().regex(/^[\w-]{43}$/);
export type Config = { origin: string; secure: boolean; trustProxy: number };
export const cookieName = (config: Config) => config.secure ? '__Host-eli_session' : 'eli_session';
const cookieOptions = (config: Config) => ({ httpOnly: true, secure: config.secure, sameSite: 'lax' as const, path: '/' });
export function writeSession(res: Response, config: Config, secret: string) {
  res.cookie(cookieName(config), secret, { ...cookieOptions(config), maxAge: day });
}
export function clearSession(res: Response, config: Config) {
  res.clearCookie(cookieName(config), cookieOptions(config));
}
export function requestToken(req: { cookies: Record<string, unknown> }, config: Config) {
  const result = secureToken.safeParse(req.cookies[cookieName(config)]);
  return result.success ? digest(result.data) : null;
}

export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}
export function deny(message = 'You do not have permission to perform this action.'): never {
  throw new HttpError(403, 'FORBIDDEN', message);
}
export function missing(): never {
  throw new HttpError(404, 'NOT_FOUND', 'The requested item was not found.');
}
export function invalid(message: string): never {
  throw new HttpError(422, 'INVALID_INPUT', message);
}
