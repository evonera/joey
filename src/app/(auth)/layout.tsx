import * as React from "react";
import { AuthProviderClient } from "./auth-provider-client";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <AuthProviderClient>{children}</AuthProviderClient>;
}
