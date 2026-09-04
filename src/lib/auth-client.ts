import { createAuthClient } from "better-auth/react"
import { dodopaymentsClient } from "@dodopayments/better-auth/client"
import { organizationClient } from "better-auth/client/plugins"

const getBaseUrl = () => {
    if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
    if (typeof window !== "undefined") return window.location.origin;
    return "http://localhost:3000";
};

export const authClient = createAuthClient({
    baseURL: getBaseUrl(),
    plugins: [dodopaymentsClient(), organizationClient()],
})

export const {
    signIn,
    signUp,
    signOut,
    useSession,
} = authClient;

