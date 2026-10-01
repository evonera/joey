'use client';

import * as React from "react";
import { AuthProvider } from "@/components/auth/auth-provider";
import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import Link from "next/link";

export function AuthProviderClient({
  children,
  socialProviders,
}: {
  children: React.ReactNode;
  socialProviders: string[];
}) {
  const router = useRouter();

  return (
    <AuthProvider
      authClient={authClient as any}
      Link={Link as any}
      navigate={({ to, replace }) => {
        if (replace) {
          router.replace(to);
        } else {
          router.push(to);
        }
      }}
      socialProviders={socialProviders}
      basePaths={{
        auth: "",
      }}
      viewPaths={{
        auth: {
          signIn: "login",
          signUp: "signup",
          forgotPassword: "forgot-password",
          resetPassword: "reset-password",
          resetLinkSent: "reset-link-sent",
        },
      }}
    >
      {children}
    </AuthProvider>
  );
}
