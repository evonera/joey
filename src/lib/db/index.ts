import { Pool } from '@neondatabase/serverless';
import { drizzle as drizzleNeonServerless } from 'drizzle-orm/neon-serverless';
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
        const connectionString = process.env.DATABASE_URL || '';
        const provider = process.env.DATABASE_PROVIDER;
        const isNeon = provider === 'neon' || connectionString.includes('neon.tech');

        if (provider === 'neon-http') {
            throw new Error("DATABASE_PROVIDER=neon-http is unsupported: Joey requires transactions. Use DATABASE_PROVIDER=neon for Neon's WebSocket pool.");
        } else if (isNeon) {
            // Use WebSocket Pool for Neon deployments so transactions and advisory locks are fully supported
            const pool = new Pool({ connectionString, connectionTimeoutMillis: 20_000, query_timeout: 30_000 });
            // Idle connections can drop when Neon suspends or the network changes.
            // Without a listener, node-postgres raises an uncaught exception.
            pool.on('error', (error: Error) => console.error('[database] Neon pool connection error:', error));
            instance = drizzleNeonServerless({ client: pool, schema }) as unknown as Db;
        } else {
            instance = drizzleNode({ client: postgres(connectionString), schema }) as unknown as Db;
        }
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
