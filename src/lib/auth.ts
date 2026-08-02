import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { dodopayments, checkout, portal, webhooks, usage } from "@dodopayments/better-auth";
import { organization } from "better-auth/plugins";
import DodoPayments from "dodopayments";
import { db } from "./db";
import * as schema from "./db/schema";
import { eq, desc, and } from "drizzle-orm";

// Dodo Payments is optional at boot so the app can be built and self-hosted
// without billing credentials. Billing routes fail gracefully at runtime if
// the key is absent.
export const dodoPayments = new DodoPayments({
    bearerToken: process.env.DODO_PAYMENTS_API_KEY || "dodo_dev_placeholder",
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

    if (meta.tenantId) return meta.tenantId as string;

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



export const auth = betterAuth({
    secret: process.env.BETTER_AUTH_SECRET || process.env.AUTH_SECRET,
    database: drizzleAdapter(db, {
        provider: "pg",
        schema: {
            user: schema.user,
            session: schema.session,
            account: schema.account,
            verification: schema.verification,
            organization: schema.tenants,
            member: schema.member,
            invitation: schema.invitation,
        }
    }),
    databaseHooks: {
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
    },
    socialProviders: {
        ...(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET ? {
            github: {
                clientId: process.env.GITHUB_CLIENT_ID,
                clientSecret: process.env.GITHUB_CLIENT_SECRET,
            },
        } : {}),
        ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET ? {
            google: {
                clientId: process.env.GOOGLE_CLIENT_ID,
                clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            },
        } : {}),
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
                    webhookKey: process.env.DODO_PAYMENTS_WEBHOOK_SECRET!,
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

import { headers } from "next/headers";

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

    // Fallback: finding the first organization they are a member of
    const membership = await db.query.member.findFirst({
        where: eq(schema.member.userId, session.user.id),
        orderBy: [desc(schema.member.createdAt)],
    });

    if (membership?.organizationId) {
        // Set it in the database for future requests
        await auth.api.setActiveOrganization({
            headers: await headers(),
            body: { organizationId: membership.organizationId }
        });
        return membership.organizationId;
    }

    throw new Error("No active workspace found");
}
