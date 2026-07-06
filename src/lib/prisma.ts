import { PrismaMariaDb } from "@prisma/adapter-mariadb";

import { PrismaClient } from "@/generated/prisma/client";
import { env } from "@/lib/env";

/**
 * Builds the MariaDB driver adapter from the DATABASE_URL connection string.
 * Parsed into an explicit pool config because the MySQL 8 default auth plugin
 * (caching_sha2_password) requires `allowPublicKeyRetrieval` when connecting
 * without TLS, an option the Prisma URL format cannot express. Mirrors the
 * adapter used by the seed script (prisma/seed.ts).
 *
 * @param {string} databaseUrl - MySQL connection string (mysql://user:pass@host:port/db).
 * @returns {PrismaMariaDb} Driver adapter ready to be passed to PrismaClient.
 */
function createAdapter(databaseUrl: string): PrismaMariaDb {
  const url = new URL(databaseUrl);

  return new PrismaMariaDb({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ""),
    allowPublicKeyRetrieval: true,
    connectionLimit: 5,
  });
}

/**
 * Instantiates a PrismaClient wired to the MariaDB driver adapter.
 *
 * @returns {PrismaClient} A ready-to-use Prisma client.
 */
function createPrismaClient(): PrismaClient {
  return new PrismaClient({ adapter: createAdapter(env.DATABASE_URL) });
}

// Cache the client on globalThis to avoid exhausting the connection pool with a
// new instance on every hot-reload in development. In production a single
// module-scoped instance is created once.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
