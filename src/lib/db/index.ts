import { neon } from '@neondatabase/serverless';
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-http';
import { drizzle as drizzleNode } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL!;

const isNeon = process.env.DATABASE_PROVIDER === 'neon' || connectionString.includes('neon.tech');

const createDbClient = () => {
    if (isNeon) {
        const sql = neon(connectionString);
        return drizzleNeon({ client: sql, schema });
    } else {
        const queryClient = postgres(connectionString);
        return drizzleNode({ client: queryClient, schema });
    }
};

export const db = createDbClient();
