import postgres from "postgres";
import { symmetricDecrypt, symmetricEncrypt } from "better-auth/crypto";
import { auth } from "@/lib/auth";
import { decrypt, encrypt } from "@/lib/crypto";

const MIGRATION_ID = "2026-tenant-bound-secrets-v2";
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required.");
if (!process.env.ENCRYPTION_KEY) throw new Error("ENCRYPTION_KEY is required.");
if (!(process.env.BETTER_AUTH_SECRET || process.env.AUTH_SECRET)) {
  throw new Error("BETTER_AUTH_SECRET or AUTH_SECRET is required to migrate OAuth tokens.");
}

const sql = postgres(connectionString, { max: 1 });

async function isOAuthCiphertext(value: string, key: Parameters<typeof symmetricDecrypt>[0]["key"]) {
  try {
    const plaintext = await symmetricDecrypt({ key, data: value });
    return plaintext.length > 0;
  } catch {
    return false;
  }
}

async function migrateSecrets() {
  const context = await auth.$context;
  const oauthKey = context.secretConfig;
  let apiKeyCount = 0;
  let telegramCount = 0;
  let oauthTokenCount = 0;
  let alreadyApplied = false;

  await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtext(${MIGRATION_ID}))`;
    const [completed] = await tx`
      SELECT id FROM joey_data_migrations WHERE id = ${MIGRATION_ID} FOR UPDATE
    `;
    if (completed) {
      alreadyApplied = true;
      return;
    }

    const apiKeys = await tx`
      SELECT id, tenant_id, encrypted_key FROM api_keys FOR UPDATE
    `;
    for (const row of apiKeys) {
      if (String(row.encrypted_key).startsWith("v2:")) continue;
      const plaintext = decrypt(String(row.encrypted_key), String(row.tenant_id));
      const ciphertext = encrypt(plaintext, String(row.tenant_id));
      if (decrypt(ciphertext, String(row.tenant_id)) !== plaintext) throw new Error("API key verification failed.");
      await tx`UPDATE api_keys SET encrypted_key = ${ciphertext} WHERE id = ${row.id}`;
      apiKeyCount += 1;
    }

    const telegramRows = await tx`
      SELECT id, tenant_id, encrypted_token FROM telegram_bot_installations FOR UPDATE
    `;
    for (const row of telegramRows) {
      if (String(row.encrypted_token).startsWith("v2:")) continue;
      const plaintext = decrypt(String(row.encrypted_token), String(row.tenant_id));
      const ciphertext = encrypt(plaintext, String(row.tenant_id));
      if (decrypt(ciphertext, String(row.tenant_id)) !== plaintext) throw new Error("Telegram token verification failed.");
      await tx`UPDATE telegram_bot_installations SET encrypted_token = ${ciphertext} WHERE id = ${row.id}`;
      telegramCount += 1;
    }

    const accounts = await tx`
      SELECT id, "accessToken", "refreshToken", "idToken"
      FROM account
      WHERE "accessToken" IS NOT NULL OR "refreshToken" IS NOT NULL OR "idToken" IS NOT NULL
      FOR UPDATE
    `;
    for (const account of accounts) {
      const values: Record<string, string | null> = {};
      for (const column of ["accessToken", "refreshToken", "idToken"] as const) {
        const value = account[column] as string | null;
        if (!value || await isOAuthCiphertext(value, oauthKey)) continue;
        const ciphertext = await symmetricEncrypt({ key: oauthKey, data: value });
        if (await symmetricDecrypt({ key: oauthKey, data: ciphertext }) !== value) {
          throw new Error("OAuth token verification failed.");
        }
        values[column] = ciphertext;
        oauthTokenCount += 1;
      }
      if (Object.keys(values).length > 0) {
        await tx`
          UPDATE account SET
            "accessToken" = ${values.accessToken ?? account.accessToken},
            "refreshToken" = ${values.refreshToken ?? account.refreshToken},
            "idToken" = ${values.idToken ?? account.idToken}
          WHERE id = ${account.id}
        `;
      }
    }

    await tx`INSERT INTO joey_data_migrations (id) VALUES (${MIGRATION_ID})`;
  });

  console.log(JSON.stringify({
    migration: MIGRATION_ID,
    apiKeysMigrated: apiKeyCount,
    telegramTokensMigrated: telegramCount,
    oauthTokensMigrated: oauthTokenCount,
    alreadyApplied,
  }));
}

migrateSecrets()
  .catch((error) => {
    console.error("Encrypted credential migration failed; transaction rolled back.", error instanceof Error ? error.message : "unknown error");
    process.exitCode = 1;
  })
  .finally(async () => {
    await sql.end();
  });
