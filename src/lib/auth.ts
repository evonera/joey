import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { dodopayments, checkout, portal, webhooks, usage } from "@dodopayments/better-auth";
import DodoPayments from "dodopayments";
import { db } from "./db";
import * as schema from "./db/schema";
import { eq } from "drizzle-orm";

export const dodoPayments = new DodoPayments({
    bearerToken: process.env.DODO_PAYMENTS_API_KEY || "",
    environment: (process.env.DODO_PAYMENTS_ENVIRONMENT as "test_mode" | "live_mode") || "test_mode",
});

export const auth = betterAuth({
    secret: process.env.BETTER_AUTH_SECRET || process.env.AUTH_SECRET,
    database: drizzleAdapter(db, {
        provider: "pg",
        schema: {
            user: schema.user,
            session: schema.session,
            account: schema.account,
            verification: schema.verification,
        }
    }),
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
        dodopayments({
            client: dodoPayments,
            createCustomerOnSignUp: true,
            getCustomerParams: (user) => ({
                metadata: { userId: user.id },
            }),
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
                    webhookKey: process.env.DODO_PAYMENTS_WEBHOOK_SECRET || "",
                    onSubscriptionActive: async (payload: any) => {
                        const userId = payload.data?.customer?.metadata?.userId;
                        if (!userId) return;
                        
                        await db.update(schema.tenants)
                            .set({ 
                                subscriptionPlan: "pro", 
                                subscriptionStatus: "active",
                                dodoCustomerId: payload.data?.customer?.customer_id
                            })
                            .where(eq(schema.tenants.ownerId, userId));
                    },
                    onSubscriptionCancelled: async (payload: any) => {
                        const userId = payload.data?.customer?.metadata?.userId;
                        if (!userId) return;

                        await db.update(schema.tenants)
                            .set({ subscriptionStatus: "canceled" })
                            .where(eq(schema.tenants.ownerId, userId));
                    },
                    onPaymentFailed: async (payload: any) => {
                        const userId = payload.data?.customer?.metadata?.userId;
                        if (!userId) return;

                        await db.update(schema.tenants)
                            .set({ subscriptionStatus: "past_due" })
                            .where(eq(schema.tenants.ownerId, userId));
                    },
                }),
            ],
        }),
    ],
});
