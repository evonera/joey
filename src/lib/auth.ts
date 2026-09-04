import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { dodopayments, checkout, portal, webhooks, usage } from "@dodopayments/better-auth";
import { organization } from "better-auth/plugins";
import DodoPayments from "dodopayments";
import { db } from "./db";
import * as schema from "./db/schema";
import { eq, desc, and, sql } from "drizzle-orm";

// Dodo Payments is optional at boot so the app can be built and self-hosted
// without billing credentials. Billing routes fail gracefully at runtime if
// the key is absent.
const DODO_API_KEY = process.env.DODO_PAYMENTS_API_KEY;
if (process.env.NODE_ENV === "production" && !DODO_API_KEY) {
    console.warn(
        "[billing] DODO_PAYMENTS_API_KEY is not set. Checkout/portal/webhook billing routes will fail. " +
        "Self-hosted instances that do not use billing can ignore this warning.",
    );
}
export const dodoPayments = new DodoPayments({
    bearerToken: DODO_API_KEY || "dodo_dev_placeholder",
    environment: (process.env.DODO_PAYMENTS_ENVIRONMENT as "test_mode" | "live_mode") || "test_mode",
});

/**
 * Resolves the tenantId from a Dodo Payments webhook payload.
 *
 * Priority:
 * 1. metadata.tenantId — present when the Dodo customer was created or
 *    updated after tenant creation (the happy path).
 * 2. metadata.userId fallback — for users whose Dodo customer was created at
 *    signup, before their tenant existed. We look up the tenant by ownerId so
 *    webhooks are never silently dropped.
 */
async function resolveTenantId(payload: any): Promise<string | null> {
    const meta = payload.data?.metadata ?? {};

    if (meta.tenantId) {
        const tenant = await db.query.tenants.findFirst({
            where: eq(schema.tenants.id, meta.tenantId as string),
            columns: { id: true },
        });
        if (tenant) return tenant.id;
    }

    if (meta.userId) {
        const membership = await db.query.member.findFirst({
            where: eq(schema.member.userId, meta.userId as string),
            orderBy: [desc(schema.member.createdAt)],
            columns: { organizationId: true },
        });
        return membership?.organizationId ?? null;
    }

    return null;
}

const isBuildPhase =
    process.env.NEXT_PHASE === "phase-production-build" ||
    process.env.npm_lifecycle_event === "build";

const authSecret =
    process.env.BETTER_AUTH_SECRET ||
    process.env.AUTH_SECRET ||
    (isBuildPhase ? "build_time_auth_secret_placeholder_value" : undefined);
if (process.env.NODE_ENV === "production" && !isBuildPhase && !authSecret) {
    throw new Error("BETTER_AUTH_SECRET or AUTH_SECRET is required in production");
}

const authBaseURL =
    process.env.BETTER_AUTH_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : isBuildPhase
            ? "https://joey.evonera.com"
            : process.env.NODE_ENV === "production"
              ? "https://joey.evonera.com"
              : "http://localhost:3000");

export const auth = betterAuth({
    secret: authSecret,
    baseURL: authBaseURL,
    database: drizzleAdapter(db, {
        provider: "pg",
        schema: {
            user: schema.user,
            session: schema.session,
            account: schema.account,
            verification: schema.verification,
            organization: schema.tenants,
            tenants: schema.tenants,
            member: schema.member,
            invitation: schema.invitation,
        }
    }),
    databaseHooks: {
        user: {
            create: {
                after: async (user) => {
                    try {
                        await provisionDefaultWorkspace(user.id, user.name);
                    } catch (err) {
                        console.error("Failed to auto-create default workspace for new user:", err);
                    }
                },
            },
        },
        session: {
            create: {
                before: async (session) => {
                    const membership = await db.query.member.findFirst({
                        where: eq(schema.member.userId, session.userId),
                        orderBy: [desc(schema.member.createdAt)],
                    });
                    return {
                        data: {
                            ...session,
                            activeOrganizationId: membership?.organizationId,
                        },
                    };
                },
            },
        },
    },
    emailAndPassword: {
        enabled: true,
        sendResetPassword: async ({ user, url }) => {
            const resendApiKey = process.env.RESEND_API_KEY;
            if (resendApiKey) {
                try {
                    const { Resend } = await import("resend");
                    const resend = new Resend(resendApiKey);
                    await resend.emails.send({
                        from: process.env.EMAIL_FROM || "Joey <no-reply@joey.evonera.com>",
                        to: user.email,
                        subject: "Reset your Joey password",
                        html: `<p>Hello ${user.name || "there"},</p><p>You requested a password reset. Click the link below to set a new password:</p><p><a href="${url}">${url}</a></p><p>If you did not request this, you can safely ignore this email.</p>`,
                    });
                } catch (err) {
                    console.error("Failed to send reset password email via Resend:", err);
                }
            } else {
                console.log(`[auth] Password reset requested for ${user.email}. Reset URL: ${url}`);
            }
        },
    },
    socialProviders: {
        google: {
            clientId: (process.env.GOOGLE_CLIENT_ID || "mock-google-client-id") as string,
            clientSecret: (process.env.GOOGLE_CLIENT_SECRET || "mock-google-client-secret") as string,
        },
    },
    plugins: [
        nextCookies(),
        organization({
            schema: {
                organization: {
                    modelName: "tenants"
                }
            }
        }),
        dodopayments({
            client: dodoPayments,
            createCustomerOnSignUp: true,
            getCustomerParams: async (user) => {
                // Look up the tenant so we can embed tenantId in Dodo metadata.
                // Webhooks use this to update the correct row without ambiguity.
                const membership = await db.query.member.findFirst({
                    where: eq(schema.member.userId, user.id),
                    orderBy: [desc(schema.member.createdAt)],
                    columns: { organizationId: true },
                });
                return {
                    name: user.name,
                    email: user.email,
                    metadata: {
                        userId: user.id,
                        ...(membership?.organizationId ? { tenantId: membership.organizationId } : {}),
                    },
                };
            },
            use: [
                checkout({
                    products: [
                        {
                            productId: process.env.NEXT_PUBLIC_DODO_PRO_PRODUCT_ID || "pdt_pro",
                            slug: "pro-plan",
                        },
                    ],
                    successUrl: "/dashboard",
                    authenticatedUsersOnly: true,
                }),
                portal(),
                usage(),
                webhooks({
                    webhookKey: process.env.DODO_PAYMENTS_WEBHOOK_SECRET || (process.env.NODE_ENV === "production" && !isBuildPhase ? (() => { throw new Error("DODO_PAYMENTS_WEBHOOK_SECRET is required in production"); })() : "dev_dodo_webhook_secret_placeholder"),
                    onSubscriptionActive: async (payload: any) => {
                        const tenantId = await resolveTenantId(payload);
                        if (!tenantId) return;

                        await db.update(schema.tenants)
                            .set({
                                subscriptionPlan: "pro",
                                subscriptionStatus: "active",
                                dodoCustomerId: payload.data?.customer_id
                            })
                            .where(eq(schema.tenants.id, tenantId));
                    },
                    onSubscriptionCancelled: async (payload: any) => {
                        const tenantId = await resolveTenantId(payload);
                        if (!tenantId) return;

                        await db.update(schema.tenants)
                            .set({ subscriptionStatus: "canceled" })
                            .where(eq(schema.tenants.id, tenantId));
                    },
                    onPaymentFailed: async (payload: any) => {
                        const tenantId = await resolveTenantId(payload);
                        if (!tenantId) return;

                        await db.update(schema.tenants)
                            .set({ subscriptionStatus: "past_due" })
                            .where(eq(schema.tenants.id, tenantId));
                    },
                }),
            ],
        }),
    ],
});

// The explicit extension keeps Eve's Node ESM authored-module evaluator from
// resolving this as a relative, extensionless Next.js package import.
import { headers } from "next/headers.js";

type AuthSession = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;

/**
 * Resolves the current user session and their active tenant in a single
 * session lookup. Throws if the user is not authenticated or has no active
 * workspace. Used by server actions that also need the session user.
 */
export async function getActiveTenant(): Promise<{ tenantId: string; user: AuthSession["user"] }> {
    const session = await auth.api.getSession({
        headers: await headers()
    });

    if (!session) {
        throw new Error("Unauthorized");
    }

    return { tenantId: await resolveActiveTenant(session), user: session.user };
}

/**
 * Shared helper to resolve the current active tenant for a user request.
 * Throws if the user is not authenticated or has no active workspace.
 */
export async function getActiveTenantId(): Promise<string> {
    const session = await auth.api.getSession({
        headers: await headers()
    });

    if (!session) {
        throw new Error("Unauthorized");
    }

    return resolveActiveTenant(session);
}

export type TenantRole = "owner" | "admin" | "member" | string;

export interface TenantMembership {
    tenantId: string;
    userId: string;
    role: TenantRole;
}

/**
 * Resolves the authenticated user's active tenant and their role within that workspace.
 * Throws if the user is unauthenticated or has no active workspace.
 * If `allowedRoles` is provided, throws if the user's role is not in the allowed list.
 */
export async function getActiveTenantMembership(
    allowedRoles?: string[]
): Promise<TenantMembership> {
    const session = await auth.api.getSession({
        headers: await headers()
    });

    if (!session) {
        throw new Error("Unauthorized");
    }

    const tenantId = await resolveActiveTenant(session);
    const membership = await db.query.member.findFirst({
        where: and(
            eq(schema.member.userId, session.user.id),
            eq(schema.member.organizationId, tenantId)
        )
    });

    const role = membership?.role || "member";
    if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(role)) {
        throw new Error(`Forbidden: Action requires role ${allowedRoles.join(" or ")}`);
    }

    return { tenantId, userId: session.user.id, role };
}

/**
 * Enforces role-based access control for workspace-sensitive actions (e.g. managing API keys,
 * minting tokens, or disconnecting integrations). Defaults to allowing only "owner" and "admin".
 * Returns the verified active tenantId.
 */
export async function requireRole(
    allowedRoles: string[] = ["owner", "admin"]
): Promise<string> {
    const { tenantId } = await getActiveTenantMembership(allowedRoles);
    return tenantId;
}

/**
 * Resolves the active tenant from an already-fetched session. Avoids a second
 * session-store round-trip when the caller already has the session in hand.
 */
export async function getActiveTenantIdFromSession(
    session: AuthSession,
): Promise<string> {
    return resolveActiveTenant(session);
}

/**
 * Atomically and idempotently provisions a default workspace and owner membership
 * for a user. If a workspace membership already exists (e.g. concurrent provisioning),
 * the existing organizationId is returned.
 */
export async function provisionDefaultWorkspace(userId: string, userName?: string | null): Promise<string> {
    return await db.transaction(async (tx) => {
        // Lock user record to serialize concurrent workspace provisioning for this user
        await tx.execute(sql`SELECT id FROM ${schema.user} WHERE id = ${userId} FOR UPDATE`);

        // Re-check membership inside transaction now that exclusive lock is held
        const existing = await tx.query.member.findFirst({
            where: eq(schema.member.userId, userId),
            orderBy: [desc(schema.member.createdAt)],
        });
        if (existing?.organizationId) {
            return existing.organizationId;
        }

        const displayName = userName?.trim() || "User";
        const slugBase = displayName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-') || 'workspace';
        const slug = `${slugBase}-${Math.random().toString(36).substring(2, 7)}`;
        const tenantId = crypto.randomUUID();

        await tx.insert(schema.tenants).values({
            id: tenantId,
            name: `${displayName}'s Workspace`,
            slug,
        });

        await tx.insert(schema.member).values({
            id: crypto.randomUUID(),
            organizationId: tenantId,
            userId,
            role: "owner",
            createdAt: new Date(),
        });

        return tenantId;
    });
}

async function resolveActiveTenant(session: AuthSession): Promise<string> {
    // Try to get the active organization from the session
    if (session.session.activeOrganizationId) {
        const activeMembership = await db.query.member.findFirst({
            where: and(
                eq(schema.member.userId, session.user.id),
                eq(schema.member.organizationId, session.session.activeOrganizationId)
            )
        });
        if (activeMembership) {
            return session.session.activeOrganizationId;
        }
    }

    // 2. Fall back to user's most recent organization membership
    const membership = await db.query.member.findFirst({
        where: eq(schema.member.userId, session.user.id),
        orderBy: [desc(schema.member.createdAt)],
    });

    if (membership?.organizationId) {
        try {
            await auth.api.setActiveOrganization({
                headers: await headers(),
                body: { organizationId: membership.organizationId }
            });
        } catch {
            // Setting cookies is not permitted during Server Component rendering; safe to ignore
        }
        return membership.organizationId;
    }

    // 3. Fallback: auto-provision a workspace atomically if the user has none yet
    try {
        return await provisionDefaultWorkspace(session.user.id, session.user.name);
    } catch (provisionErr) {
        console.error("Failed to provision workspace in resolveActiveTenant:", provisionErr);
        throw new Error("No active workspace found");
    }
}
