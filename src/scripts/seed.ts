import { drizzle as drizzleNode } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is required. See .env.example");
  process.exit(1);
}

const sql = postgres(connectionString, { max: 1 });
const db = drizzleNode({ client: sql, schema });

async function seed() {
  console.log("Seeding development data...");

  // A deterministic tenant id for local dev so the script is idempotent-ish.
  const tenantId = process.env.SEED_TENANT_ID || "dev-tenant";
  const agentConfigId = "dev-agent-config";

  // Upsert tenant
  await db
    .insert(schema.tenants)
    .values({
      id: tenantId,
      name: "Acme Demo Studio",
      slug: "acme-demo",
      subscriptionPlan: "free",
      subscriptionStatus: "inactive",
    })
    .onConflictDoNothing();

  // Upsert agent config
  await db
    .insert(schema.agentConfigs)
    .values({
      id: agentConfigId,
      tenantId,
      brandVoice: "Friendly, witty, and data-driven. We talk like a helpful teammate.",
      postingGoals: "Drive engagement and position Acme as the go-to automation tool.",
      postingSchedule: {
        cadence: "daily",
        timezone: "UTC",
        activeDays: ["mon", "tue", "wed", "thu", "fri"],
        times: ["09:00", "15:00"],
      },
      nextDraftAt: new Date(),
      isPaused: false,
    })
    .onConflictDoNothing();

  // A couple of sample published posts for analytics/calendar seeding.
  const now = new Date();
  await db
    .insert(schema.posts)
    .values([
      {
        tenantId,
        content: "Automate the busywork, so your team can focus on the work that matters.",
        publishedAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
        status: "published",
        metrics: { views: 1240, likes: 82, comments: 12, shares: 9 },
      },
      {
        tenantId,
        content: "BYOK means your data stays yours. Run Joey with your own keys.",
        publishedAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
        status: "published",
        metrics: { views: 980, likes: 64, comments: 7, shares: 15 },
      },
    ])
    .onConflictDoNothing();

  console.log("Done. Tenant:", tenantId);
  await sql.end();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});