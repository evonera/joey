import { Checkout } from '@dodopayments/nextjs'

export const POST = Checkout({
    bearerToken: process.env.DODO_PAYMENTS_API_KEY!,
    returnUrl: process.env.DODO_PAYMENTS_RETURN_URL,
    environment: (process.env.DODO_PAYMENTS_ENVIRONMENT as any) || "test_mode",
    type: "session",
});
