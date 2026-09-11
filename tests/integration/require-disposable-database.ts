import postgres from "postgres";

/**
 * Refuse to run destructive integration cleanup unless the target is either a
 * local PostgreSQL instance or the exact disposable Neon branch named by the
 * caller. Neon exposes its immutable branch id as a server setting, so a stale
 * or incorrect connection string cannot be mistaken for the test branch.
 */
export async function requireDisposableDatabase(): Promise<void> {
  const url = new URL(process.env.DATABASE_URL || "postgres://invalid");

  if (process.env.JOEY_INTEGRATION_TEST !== "true") {
    throw new Error("Integration checks require JOEY_INTEGRATION_TEST=true.");
  }

  if (["localhost", "127.0.0.1"].includes(url.hostname)) return;

  const expectedBranchId = process.env.JOEY_NEON_TEST_BRANCH_ID;
  if (!url.hostname.endsWith(".neon.tech") || !expectedBranchId?.startsWith("br-")) {
    throw new Error("A disposable local database or explicitly identified Neon test branch is required.");
  }

  const sql = postgres(url.toString(), { max: 1 });
  try {
    const [identity] = await sql<[{ branchId: string | null }]>`
      select current_setting('neon.branch_id', true) as "branchId"
    `;
    if (identity?.branchId !== expectedBranchId) {
      throw new Error(
        `Refusing integration checks: connected Neon branch ${identity?.branchId || "unknown"} does not match ${expectedBranchId}.`,
      );
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}
