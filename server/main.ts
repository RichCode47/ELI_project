import 'dotenv/config';
import { database, checkDatabase } from './db.js';
import { createApp } from './app.js';

const databaseUrl = process.env.DATABASE_URL;
const appOrigin = process.env.APP_ORIGIN;
const port = Number(process.env.PORT ?? 3001);
const production = process.env.NODE_ENV === 'production';

if (!databaseUrl || !appOrigin || !Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('Configure DATABASE_URL, APP_ORIGIN and PORT.');
}
const origin = new URL(appOrigin);
if (origin.origin !== appOrigin || !['http:', 'https:'].includes(origin.protocol) || (production && origin.protocol !== 'https:')) {
  throw new Error('APP_ORIGIN must be an origin with no path or trailing slash, using HTTPS in production.');
}
const trustProxy = Number(process.env.TRUST_PROXY_HOPS ?? 0);
if (!Number.isInteger(trustProxy) || trustProxy < 0) throw new Error('TRUST_PROXY_HOPS must be a non-negative integer.');

const db = database(databaseUrl);
await checkDatabase(db);
const server = createApp(db, { origin: appOrigin, secure: origin.protocol === 'https:', trustProxy })
  .listen(port, production ? '0.0.0.0' : '127.0.0.1', () => {
    console.info(JSON.stringify({ event: 'server_started', port }));
  });
server.requestTimeout = 30000;
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => server.close(() => {
    void db.$disconnect().finally(() => process.exit(0));
  }));
}
