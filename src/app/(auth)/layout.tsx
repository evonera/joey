import * as React from "react";
import { AuthProviderClient } from "./auth-provider-client";
import { getConfiguredSocialProviders } from "@/lib/auth-ui-config";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const socialProviders = getConfiguredSocialProviders();
  return <AuthProviderClient socialProviders={socialProviders}>{children}</AuthProviderClient>;
}
