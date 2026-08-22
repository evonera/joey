import { neon } from '@neondatabase/serverless';
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-http';
import { drizzle as drizzleNode } from 'drizzle-orm/postgres-js';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

// Lazily constructed: importing this module must not require DATABASE_URL so
// that pure logic (flow executor, unit tests) can transitively import schemas
// and node definitions without a database configured.

type Db = PostgresJsDatabase<typeof schema>;
let instance: Db | null = null;

function getDb(): Db {
    if (!instance) {
        const connectionString = process.env.DATABASE_URL!;
        const isNeon = process.env.DATABASE_PROVIDER === 'neon' || connectionString.includes('neon.tech');
        // Both drivers expose the same query-builder surface we use; typed as
        // the postgres-js shape for stable inference across call sites.
        instance = (
            isNeon
                ? drizzleNeon({ client: neon(connectionString), schema })
                : drizzleNode({ client: postgres(connectionString), schema })
        ) as unknown as Db;
    }
    return instance;
}

export const db = new Proxy({} as Db, {
    get(_target, prop) {
        const real = getDb() as unknown as Record<string | symbol, unknown>;
        const value = real[prop];
        return typeof value === "function" ? value.bind(real) : value;
    },
});
