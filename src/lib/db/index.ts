import { Pool, neon } from '@neondatabase/serverless';
import { drizzle as drizzleNeonServerless } from 'drizzle-orm/neon-serverless';
import { drizzle as drizzleNeonHttp } from 'drizzle-orm/neon-http';
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
        const isNeonHttp = provider === 'neon-http';
        const isNeon = provider === 'neon' || connectionString.includes('neon.tech');

        if (isNeonHttp) {
            instance = drizzleNeonHttp({ client: neon(connectionString), schema }) as unknown as Db;
        } else if (isNeon) {
            // Use WebSocket Pool for Neon deployments so transactions and advisory locks are fully supported
            instance = drizzleNeonServerless({ client: new Pool({ connectionString }), schema }) as unknown as Db;
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
