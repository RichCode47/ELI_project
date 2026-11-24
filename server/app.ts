import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import cookieParser from 'cookie-parser';
import express from 'express';
import type { ErrorRequestHandler } from 'express';
import helmet from 'helmet';
import { z } from 'zod';
import { Prisma } from '../generated/prisma/client.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import { identityRoutes } from './identity.js';
import { recordRoutes } from './records.js';
import { openapi } from './openapi.js';
import { checkDatabase } from './db.js';
import { digest, HttpError } from './security.js';
import type { Config } from './security.js';

export function createApp(db: PrismaClient, config: Config) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.use(helmet({
    strictTransportSecurity: config.secure,
    contentSecurityPolicy: { directives: {
      'img-src': ["'self'", 'data:'], 'style-src': ["'self'", "'unsafe-inline'"],
      'upgrade-insecure-requests': config.secure ? [] : null,
    } },
  }));
  app.use('/api', (req, res, next) => {
    res.locals.requestId = randomUUID();
    res.set({ 'Cache-Control': 'private, no-store', 'X-Request-Id': res.locals.requestId });
    const startedAt = performance.now();
    res.on('finish', () => {
      if (res.statusCode >= 500) console.error(JSON.stringify({
        event: 'api_error', requestId: res.locals.requestId, method: req.method, status: res.statusCode,
        durationMs: Math.round(performance.now() - startedAt),
      }));
    });
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) { next(); return; }
    if (req.get('Origin') !== config.origin || req.get('X-ELI-Request') !== '1') {
      next(new HttpError(403, 'ORIGIN_REJECTED', 'The request origin could not be verified.'));
      return;
    }
    next();
  });
  app.use('/api', express.json({ limit: '64kb' }), cookieParser());
  app.get('/api/health/live', (_req, res) => { res.json({ status: 'ok' }); });
  app.get('/api/health/ready', async (_req, res) => {
    try { await checkDatabase(db); res.json({ status: 'ready' }); }
    catch { res.status(503).json({ status: 'unavailable' }); }
  });
  app.get('/api/v1/openapi.json', (_req, res) => { res.json(openapi(config)); });
  app.use('/api/v1', async (req, _res, next) => {
    const endpoint = ['/auth/login', '/auth/register', '/auth/accept-invite'].includes(req.path.toLowerCase().replace(/\/+$/, '')) ? 'identity' : 'api';
    const window = endpoint === 'identity' ? 900_000 : 60_000;
    const limit = endpoint === 'identity' ? 20 : 400;
    const now = new Date();
    const key = digest(endpoint + ':' + (req.ip ?? 'unknown'));
    const [bucket] = await db.$queryRaw<{ hits: number; resetAt: Date }[]>`
      INSERT INTO "RateBucket" ("key", "hits", "resetAt") VALUES (${key}, 1, ${new Date(now.getTime() + window)})
      ON CONFLICT ("key") DO UPDATE SET
        "hits" = CASE WHEN "RateBucket"."resetAt" <= ${now} THEN 1 ELSE LEAST("RateBucket"."hits" + 1, ${limit + 1}) END,
        "resetAt" = CASE WHEN "RateBucket"."resetAt" <= ${now} THEN EXCLUDED."resetAt" ELSE "RateBucket"."resetAt" END
      RETURNING "hits", "resetAt"`;
    if (bucket.hits > limit) throw new HttpError(429, 'RATE_LIMITED', 'Too many requests. Please try again later.');
    next();
  });
  app.use('/api/v1', identityRoutes(db, config), recordRoutes(db, config));
  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'NOT_FOUND', 'The requested endpoint was not found.')));

  const dist = resolve('dist');
  if (existsSync(resolve(dist, 'index.html'))) {
    app.use(express.static(dist));
    app.get('/{*path}', (_req, res) => { res.sendFile(resolve(dist, 'index.html')); });
  }

  const onError: ErrorRequestHandler = (error, _req, res, _next) => {
    if (res.headersSent) { _next(error); return; }
    let problem = { status: 500, code: 'SERVER_ERROR', message: 'Something went wrong. Try again or share the request ID with support.' };
    if (error instanceof HttpError) problem = error;
    else if (error instanceof z.ZodError) {
      problem = { status: 422, code: 'INVALID_INPUT',
        message: error.issues.map((issue) => [issue.path.join('.'), issue.message].filter(Boolean).join(' — ')).join('; ') };
    } else if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') problem = { status: 409, code: 'ALREADY_EXISTS', message: 'An item with this identifier already exists.' };
      if (error.code === 'P2003') problem = { status: 409, code: 'IN_USE', message: 'This item is referenced by another record.' };
      if (error.code === 'P2025') problem = { status: 404, code: 'NOT_FOUND', message: 'The requested item was not found.' };
      if (error.code === 'P2034') problem = { status: 409, code: 'TRY_AGAIN', message: 'Another update occurred. Please retry.' };
      if (problem.status === 500) console.error(JSON.stringify({ event: 'database_error', code: error.code, requestId: res.locals.requestId }));
    } else if (error?.type === 'entity.parse.failed') {
      problem = { status: 400, code: 'INVALID_JSON', message: 'The JSON body could not be parsed.' };
    } else if (error?.type === 'entity.too.large') {
      problem = { status: 413, code: 'REQUEST_TOO_LARGE', message: 'The request body is too large.' };
    } else {
      console.error(JSON.stringify({ event: 'unexpected_error', type: error instanceof Error ? error.name : 'unknown', requestId: res.locals.requestId }));
    }
    res.status(problem.status).json({ error: { code: problem.code, message: problem.message, requestId: res.locals.requestId } });
  };
  app.use(onError);
  return app;
}
