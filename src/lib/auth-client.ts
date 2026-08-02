import { createAuthClient } from "better-auth/react"
import { dodopaymentsClient } from "@dodopayments/better-auth/client"
import { organizationClient } from "better-auth/client/plugins"

export const authClient = createAuthClient({
    baseURL: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
    plugins: [dodopaymentsClient(), organizationClient()],
})
