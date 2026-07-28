import { neon } from '@neondatabase/serverless';
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-http';
import { drizzle as drizzleNode } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL!;

const createDbClient = () => {
    if (connectionString.includes('neon.tech')) {
        const sql = neon(connectionString);
        return drizzleNeon({ client: sql, schema }) as any;
    } else {
        const queryClient = postgres(connectionString);
        return drizzleNode({ client: queryClient, schema }) as any;
    }
};

export const db = createDbClient();
