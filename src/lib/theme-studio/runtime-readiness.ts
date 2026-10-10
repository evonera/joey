import { isR2Configured } from "@/lib/storage";

export function themeMediaStorageReady() {
  return isR2Configured() && /^https:\/\//i.test(process.env.R2_PUBLIC_URL || process.env.NEXT_PUBLIC_R2_PUBLIC_URL || "");
}
